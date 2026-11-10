#import <CoreMotion/CoreMotion.h>
#import <React/RCTBridge.h>
#import <React/RCTEventDispatcher.h>
#import "StepCounter.h"
#import "SOMotionDetecter.h"

@interface StepCounter ()
@property (nonatomic, readonly) CMPedometer *pedometer;
@property (nonatomic, strong) dispatch_queue_t stateQueue;

// Session control
@property (nonatomic, strong) NSDate *sessionStartDate;
@property (nonatomic) NSUInteger sessionGeneration;

// Monotonic guard for live updates (cumulative from sessionStartDate)
@property (nonatomic) NSInteger lastEmittedSteps;

- (void)emitCumulativeUpdate:(CMPedometerData *)data forGeneration:(NSUInteger)generation;
- (void)emitError:(NSError *)error forGeneration:(NSUInteger)generation;
@end

@implementation StepCounter

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@synthesize bridge = _bridge;
@synthesize callableJSModules = _callableJSModules;

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"StepCounter.stepCounterUpdate",
    @"StepCounter.stepDetected",
    @"StepCounter.pedometerEvent",
    @"StepCounter.errorOccurred",
    @"StepCounter.stepsSensorInfo"
  ];
}

#ifdef RCT_NEW_ARCH_ENABLED
// In New Architecture, RCTEventEmitter.receiveEvent is not a registered callable JS module.
// In bridgeless mode (RCTHost), _bridge is nil; events must go through callableJSModules.
// In bridge-based New Architecture, fall back to _bridge.enqueueJSCall via RCTDeviceEventEmitter.
- (void)sendEventWithName:(NSString *)eventName body:(id)body {
  NSArray *args = body ? @[eventName, body] : @[eventName];
  if (_callableJSModules) {
    [_callableJSModules invokeModule:@"RCTDeviceEventEmitter"
                              method:@"emit"
                            withArgs:args];
  } else if (_bridge) {
    [_bridge enqueueJSCall:@"RCTDeviceEventEmitter"
                    method:@"emit"
                      args:args
                completion:nil];
  }
}
#endif // RCT_NEW_ARCH_ENABLED

#pragma mark - Public API

RCT_EXPORT_METHOD(isStepCountingSupported:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  resolve(@{
    @"granted": @([self authorizationStatus]),
    @"supported": @([CMPedometer isStepCountingAvailable]),
    @"authorizationStatus": [self authorizationStatusString],
  });

  [self sendEventWithName:@"StepCounter.stepsSensorInfo"
                     body:[self dictionaryAboutSensorInfo]];
}

RCT_EXPORT_METHOD(queryPedometerDataBetweenDates:(double)startDate
                  endDate:(double)endDate
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  NSDate *start = [self dateFromTimestamp:startDate];
  NSDate *end = [self dateFromTimestamp:endDate];

  if ([start compare:end] == NSOrderedDescending) {
    reject(@"INVALID_RANGE", @"startDate must be before or equal to endDate", nil);
    return;
  }

  [self.pedometer queryPedometerDataFromDate:start
                                      toDate:end
                                 withHandler:^(CMPedometerData *pedometerData, NSError *error) {
    if (error) {
      reject(@"QUERY_FAILED", error.localizedDescription, error);
      return;
    }
    resolve([self dictionaryFromPedometerData:pedometerData
                            fallbackStartDate:start
                              fallbackEndDate:end]);
  }];
}

RCT_EXPORT_METHOD(startStepCounterUpdate:(double)from) {
  // Stop any in-progress pedometer session before starting a new one.
  [self.pedometer stopPedometerUpdates];
  [self stopPedometerEventUpdatesIfAvailable];

  // --- Timestamp guard (ms vs seconds) ---
  // Valid Unix timestamp in seconds is ~1.7–2.0e9 (2024–2033),
  // while milliseconds is ~1.7–2.0e12.
  double fromSeconds = (from > 1e12) ? (from / 1000.0) : from;

  // Clamp any future timestamp to "now" so queryPedometerDataFromDate:toDate:
  // never receives fromDate > toDate on slight JS/native clock skew.
  NSDate *now = [NSDate date];
  NSDate *requested = (fromSeconds > 0) ? [NSDate dateWithTimeIntervalSince1970:fromSeconds] : now;
  if ([requested compare:now] == NSOrderedDescending) {
    requested = now;
  }

  // Reset session state atomically before starting new handlers.
  // Use -1 so an initial 0-step seed query emits once to initialize JS consumers.
  __block NSUInteger generation = 0;
  dispatch_sync(_stateQueue, ^{
    self->_sessionGeneration += 1;
    generation = self->_sessionGeneration;
    self->_sessionStartDate = requested;
    self->_lastEmittedSteps = -1;
  });

  // Seed with the current cumulative total so JS does not wait for the next step.
  [self.pedometer queryPedometerDataFromDate:requested
                                      toDate:now
                                 withHandler:^(CMPedometerData *data, NSError *error) {
    if (error) {
      [self emitError:error forGeneration:generation];
      return;
    }
    [self emitCumulativeUpdate:data forGeneration:generation];
  }];

  // Live updates from requested start date. `steps` and `distance` are both
  // cumulative for [sessionStartDate, now], matching queryPedometerDataBetweenDates.
  [self.pedometer startPedometerUpdatesFromDate:requested
                                    withHandler:^(CMPedometerData *data, NSError *error) {
    if (error) {
      [self emitError:error forGeneration:generation];
      return;
    }
    [self emitCumulativeUpdate:data forGeneration:generation];
  }];

  [self startPedometerEventUpdatesIfAvailable];
}

- (void)emitError:(NSError *)error forGeneration:(NSUInteger)generation {
  __block BOOL isActiveGeneration = NO;
  dispatch_sync(self->_stateQueue, ^{
    isActiveGeneration = (self->_sessionStartDate != nil && self->_sessionGeneration == generation);
  });
  if (isActiveGeneration) {
    [self sendEventWithName:@"StepCounter.errorOccurred"
                       body:[self dictionaryFromError:error]];
  }
}

- (void)emitCumulativeUpdate:(CMPedometerData *)data forGeneration:(NSUInteger)generation {
  if (!data) {
    return;
  }

  __block NSDictionary *body = nil;
  dispatch_sync(self->_stateQueue, ^{
    if (!self->_sessionStartDate || self->_sessionGeneration != generation) {
      return;
    }

    // iOS can interleave segment/window updates with a different startDate.
    NSTimeInterval startDiff = fabs([data.startDate timeIntervalSinceDate:self->_sessionStartDate]);
    if (startDiff > 1.0) {
      return;
    }

    NSInteger cumulative = data.numberOfSteps.integerValue;
    if (cumulative < 0) {
      return;
    }

    if (cumulative <= self->_lastEmittedSteps) {
      return;
    }
    self->_lastEmittedSteps = cumulative;

    NSMutableDictionary *mBody = [[self dictionaryFromPedometerData:data
                                                  fallbackStartDate:self->_sessionStartDate
                                                    fallbackEndDate:data.endDate] mutableCopy];
    mBody[@"startDate"] = @(llround(self->_sessionStartDate.timeIntervalSince1970 * 1000.0));
    mBody[@"steps"] = @(cumulative);
    mBody[@"counterType"] = @"CMPedometer";
    body = [mBody copy];
  });
  if (body) {
    [self sendEventWithName:@"StepCounter.stepCounterUpdate" body:body];
  }
}

RCT_EXPORT_METHOD(stopStepCounterUpdate) {
  [self.pedometer stopPedometerUpdates];
  [self stopPedometerEventUpdatesIfAvailable];
  [[SOMotionDetecter sharedInstance] stopDetection];

  dispatch_sync(_stateQueue, ^{
    self->_sessionGeneration += 1;
    self->_sessionStartDate = nil;
    self->_lastEmittedSteps = -1;
  });
}

- (void)invalidate {
  [self stopStepCounterUpdate];
  [super invalidate];
}

RCT_EXPORT_METHOD(startStepsDetection) {
  [[SOMotionDetecter sharedInstance]
   startDetectionWithUpdateBlock:^(NSError *error) {
    if (error) {
      [self sendEventWithName:@"StepCounter.errorOccurred"
                         body:[self dictionaryFromError:error]];
    } else {
      [self sendEventWithName:@"StepCounter.stepDetected" body:@true];
    }
  }];
}

#pragma mark - Pedometer events

- (BOOL)isPedometerEventTrackingSupported {
  if (@available(iOS 10.0, *)) {
    return [CMPedometer isPedometerEventTrackingAvailable];
  }
  return NO;
}

- (void)startPedometerEventUpdatesIfAvailable {
  if (![self isPedometerEventTrackingSupported]) {
    return;
  }

  if (@available(iOS 10.0, *)) {
    [self.pedometer stopPedometerEventUpdates];
    [self.pedometer startPedometerEventUpdatesWithHandler:^(CMPedometerEvent *event, NSError *error) {
      if (error) {
        [self sendEventWithName:@"StepCounter.errorOccurred"
                           body:[self dictionaryFromError:error]];
        return;
      }
      if (!event) {
        return;
      }

      NSString *type = nil;
      if (event.type == CMPedometerEventTypePause) {
        type = @"pause";
      } else if (event.type == CMPedometerEventTypeResume) {
        type = @"resume";
      }
      if (!type) {
        return;
      }

      [self sendEventWithName:@"StepCounter.pedometerEvent"
                         body:@{
                           @"type": type,
                           @"date": @(llround(event.date.timeIntervalSince1970 * 1000.0)),
                         }];
    }];
  }
}

- (void)stopPedometerEventUpdatesIfAvailable {
  if (@available(iOS 10.0, *)) {
    [self.pedometer stopPedometerEventUpdates];
  }
}

#pragma mark - Sensor info / mapping

- (NSDictionary *)dictionaryFromError:(NSError *)error {
  if (!error) {
    return @{@"message": @"Unknown CoreMotion error"};
  }
  return @{
    @"message": error.localizedDescription ?: @"Unknown CoreMotion error",
    @"code": @(error.code),
    @"domain": error.domain ?: @"",
  };
}

- (NSDate *)dateFromTimestamp:(double)timestamp {
  double seconds = (timestamp > 1e12) ? (timestamp / 1000.0) : timestamp;
  if (seconds <= 0) {
    return [NSDate date];
  }
  return [NSDate dateWithTimeIntervalSince1970:seconds];
}

- (NSDictionary *)dictionaryAboutSensorInfo {
  return @{
    @"name": @"CMPedometer",
    @"granted": @([self authorizationStatus]),
    @"authorizationStatus": [self authorizationStatusString],
    @"stepCounting": @([CMPedometer isStepCountingAvailable]),
    @"pace": @([CMPedometer isPaceAvailable]),
    @"cadence": @([CMPedometer isCadenceAvailable]),
    @"distance": @([CMPedometer isDistanceAvailable]),
    @"floorCounting": @([CMPedometer isFloorCountingAvailable]),
    @"pedometerEventTracking": @([self isPedometerEventTrackingSupported]),
  };
}

- (NSDictionary *)dictionaryFromPedometerData:(CMPedometerData *)data
                            fallbackStartDate:(NSDate *)fallbackStart
                              fallbackEndDate:(NSDate *)fallbackEnd {
  NSDate *resolvedStart = data.startDate ?: fallbackStart ?: [NSDate date];
  NSDate *resolvedEnd = data.endDate ?: fallbackEnd ?: resolvedStart;
  NSNumber *startDate = @(llround(resolvedStart.timeIntervalSince1970 * 1000.0));
  NSNumber *endDate = @(llround(resolvedEnd.timeIntervalSince1970 * 1000.0));

  if (!data) {
    return @{
      @"counterType": @"CMPedometer",
      @"startDate": startDate,
      @"endDate": endDate,
      @"steps": @(0),
      @"distance": @(0.0),
      @"calories": @(0.0),
    };
  }

  NSInteger steps = data.numberOfSteps ? MAX(0, data.numberOfSteps.integerValue) : 0;
  double distance = data.distance ? MAX(0.0, data.distance.doubleValue) : 0.0;
  NSNumber *calories = @(steps * 0.045);

  NSMutableDictionary *payload = [@{
    @"counterType": @"CMPedometer",
    @"startDate": startDate,
    @"endDate": endDate,
    @"steps": @(steps),
    @"distance": @(distance),
    @"calories": calories,
  } mutableCopy];

  if (data.floorsAscended) {
    payload[@"floorsAscended"] = data.floorsAscended;
  }
  if (data.floorsDescended) {
    payload[@"floorsDescended"] = data.floorsDescended;
  }
  if ([CMPedometer isPaceAvailable]) {
    if (data.currentPace) {
      payload[@"currentPaceSecPerM"] = data.currentPace;
    }
    if (data.averageActivePace) {
      payload[@"averageActivePaceSecPerM"] = data.averageActivePace;
    }
  }
  if ([CMPedometer isCadenceAvailable] && data.currentCadence) {
    payload[@"currentCadenceStepsPerSec"] = data.currentCadence;
  }

  return [payload copy];
}

- (NSString *)authorizationStatusString {
  if (@available(iOS 11.0, *)) {
    switch ([CMPedometer authorizationStatus]) {
      case CMAuthorizationStatusNotDetermined:
        return @"notDetermined";
      case CMAuthorizationStatusRestricted:
        return @"restricted";
      case CMAuthorizationStatusDenied:
        return @"denied";
      case CMAuthorizationStatusAuthorized:
        return @"authorized";
    }
  }
  return @"unknown";
}

- (BOOL)authorizationStatus {
  if (@available(iOS 11.0, *)) {
    return [CMPedometer authorizationStatus] == CMAuthorizationStatusAuthorized;
  }
  return NO;
}

#pragma mark - Init

- (instancetype)init {
  self = [super init];
  if (!self) return nil;

  _pedometer = [[CMPedometer alloc] init];
  _stateQueue = dispatch_queue_create("com.blife.rnstepcounter.state", DISPATCH_QUEUE_SERIAL);
  _lastEmittedSteps = -1;

  return self;
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeStepCounterSpecJSI>(params);
}
#endif // RCT_NEW_ARCH_ENABLED

@end
