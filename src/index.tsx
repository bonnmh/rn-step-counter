import type { EventSubscription } from "react-native";
import StepCounterModule, {
  errorEventName,
  eventName,
  NAME,
  pedometerEventName,
  sensorInfoEventName,
  stepDetectedEventName,
  VERSION,
  type CounterType,
  type MotionAuthorizationStatus,
  type PedometerEvent,
  type PedometerEventType,
  type Spec,
  type StepCountData,
  type StepCountingSupportResult,
  type StepCounterError,
  type StepsSensorInfo,
} from "./NativeStepCounter";
import { NativeEventEmitter, Platform } from "react-native";
import { PACKAGE_NAME, REPOSITORY_WEB_URL } from "./packageMeta";

/* A way to check if the module is linked. */
const LINKING_ERROR =
  `The package '${PACKAGE_NAME}' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({
    ios: "- You have run `pod install` in the `ios` directory and then clean, rebuild and re-run the app. You may also need to re-open Xcode to get the new pods.\n",
    android:
      "- You have the Android development environment set up: `https://reactnative.dev/docs/environment-setup.`",
    default: "",
  }) +
  '- Use the "npx react-native clean" command to clean up the module\'s cache and select the ' +
  '"watchman", "metro", "android", "npm" (and your package manager) options with comma-separated. ' +
  "Re-install packages and re-build the app again.\n" +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n" +
  `If none of these fix the issue, please open an issue on the package repository: ${REPOSITORY_WEB_URL}`;

export interface ParsedStepCountData {
  dailyGoal: string;
  steps: number;
  stepsString: string;
  calories: string;
  startDate: string;
  endDate: string;
  distance: string;
}

/**
 * A module that allows you to get the step count data.
 * `CMStepCounter` is deprecated in iOS 8.0. Used `CMPedometer` instead.
 * floorsAscended - The number of floors ascended during the time period. iOS Only.
 * floorsDescended - The number of floors descended during the time period. iOS Only.
 * counterType - The type of counter used to count the steps.
 * @throws {Error} LINKING_ERROR - Throws Error If global variable turboModuleProxy is undefined.
 * @example
 * import { StepCounter } from '@blife/rn-step-counter';
 */
const StepCounter = (
  StepCounterModule
    ? StepCounterModule
    : new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        }
      )
) as Spec;

let _stepEventEmitter: NativeEventEmitter | null = null;

function getStepEventEmitter(): NativeEventEmitter {
  if (!_stepEventEmitter) {
    if (!StepCounterModule) {
      throw new Error(LINKING_ERROR);
    }
    _stepEventEmitter = new NativeEventEmitter(StepCounter);
  }
  return _stepEventEmitter;
}

type StepCountUpdateCallback = (data: StepCountData) => void;
export type StepCountFilter = (data: StepCountData) => StepCountData | null;

export interface StepCountFilterOptions {
  /**
   * Minimum elapsed time expected per accepted step.
   *
   * Events that imply a faster cadence are treated as sensor false positives.
   * 250ms allows up to 4 steps/second, which is already faster than typical walking.
   */
  minimumStepIntervalMs?: number;
  /**
   * When false, the filter only rejects invalid/negative step values.
   * Use this for fused pedometers (iOS CMPedometer) that already batch updates.
   */
  enabled?: boolean;
}

const DEFAULT_MINIMUM_STEP_INTERVAL_MS = 250;

// Tracks the subscription created by the most recent startStepCounterUpdate call.
// Only this subscription is removed in stopStepCounterUpdate, so that external
// subscribers (e.g. debug log components) are not unintentionally removed.
let _activeSubscription: EventSubscription | null = null;

/**
 * Transform the step count data into a more readable format.
 * You can use it or directly use the `StepCountData` type.
 * @param {StepCountData} data - Step Counter Sensor Event Data.
 * @returns {ParsedStepCountData} - String Parsed Count Data.
 */
export function parseStepData(data: StepCountData): ParsedStepCountData {
  const { steps, startDate, endDate, distance } = data;
  const safeSteps = Number.isFinite(steps) ? steps : 0;
  const safeDistance = Number.isFinite(distance) ? distance : 0;
  const dailyGoal = 10000;
  const stepsString = safeSteps + " steps";
  const kCal = (safeSteps * 0.045).toFixed(2) + "kCal";
  const endDateTime = new Date(endDate).toLocaleTimeString("en-gb");
  const startDateTime = new Date(startDate).toLocaleTimeString("en-gb");
  const roundedDistance = safeDistance.toFixed(1) + "m";
  const stepGoalStatus =
    safeSteps >= dailyGoal ? "Goal Reached" : `${safeSteps}/${dailyGoal} steps`;
  return {
    dailyGoal: stepGoalStatus,
    steps: safeSteps,
    stepsString,
    calories: kCal,
    startDate: startDateTime,
    endDate: endDateTime,
    distance: roundedDistance,
  };
}

/**
 * Create a stateful filter for live step-count updates.
 *
 * Native pedometer APIs on Android (especially the accelerometer fallback) can
 * react to quick hand rotation. This helper drops updates that imply an
 * impossible cadence and rebases later cumulative values so ignored burst steps
 * do not come back on the next event.
 *
 * Cadence burst rejection runs for `ACCELEROMETER` only. Fused Apple Core Motion
 * pedometer updates (`CMPedometer`) and Android hardware `STEP_COUNTER` batches
 * already apply their own filtering and legitimately deliver multi-step updates
 * with short inter-callback gaps, so those counter types pass through. Steps
 * already ignored in the same filter are still subtracted.
 */
export function createStepCountFilter(options: StepCountFilterOptions = {}): StepCountFilter {
  const enabled = options.enabled !== false;
  const minimumStepIntervalMs =
    options.minimumStepIntervalMs && options.minimumStepIntervalMs > 0
      ? options.minimumStepIntervalMs
      : DEFAULT_MINIMUM_STEP_INTERVAL_MS;

  let previousRawData: StepCountData | null = null;
  let ignoredSteps = 0;
  let ignoredDistance = 0;

  return (data: StepCountData) => {
    if (!Number.isFinite(data.steps) || data.steps < 0) {
      return null;
    }

    const safeDistance = Number.isFinite(data.distance) ? data.distance : 0;

    if (!enabled) {
      return safeDistance === data.distance ? data : { ...data, distance: safeDistance };
    }

    if (
      previousRawData &&
      (data.counterType !== previousRawData.counterType ||
        data.startDate !== previousRawData.startDate)
    ) {
      previousRawData = null;
      ignoredSteps = 0;
      ignoredDistance = 0;
    }

    if (previousRawData && data.steps < previousRawData.steps) {
      previousRawData = data;
      ignoredSteps = 0;
      ignoredDistance = 0;
      return safeDistance === data.distance ? data : { ...data, distance: safeDistance };
    }

    const rebaseStepData = (raw: StepCountData): StepCountData => {
      const steps = Math.max(0, raw.steps - ignoredSteps);
      const distance = Math.max(0, safeDistance - ignoredDistance);
      const calories =
        typeof raw.calories === "number" && Number.isFinite(raw.calories)
          ? Math.max(0, raw.calories - ignoredSteps * 0.045)
          : raw.calories;
      return {
        ...raw,
        steps,
        distance,
        ...(calories !== undefined ? { calories } : {}),
      };
    };

    if (data.counterType === "CMPedometer" || data.counterType === "STEP_COUNTER") {
      previousRawData = data;
      if (ignoredSteps === 0 && ignoredDistance === 0) {
        return safeDistance === data.distance ? data : { ...data, distance: safeDistance };
      }
      return rebaseStepData(data);
    }

    const previousDistance =
      previousRawData && Number.isFinite(previousRawData.distance) ? previousRawData.distance : 0;
    const referenceTime = previousRawData ? previousRawData.endDate : data.startDate;
    const stepDelta = previousRawData ? data.steps - previousRawData.steps : data.steps;
    const distanceDelta = previousRawData ? safeDistance - previousDistance : safeDistance;
    const interEventElapsedMs =
      Number.isFinite(data.endDate) && Number.isFinite(referenceTime)
        ? data.endDate - referenceTime
        : Number.POSITIVE_INFINITY;
    const isSuspiciousBurst =
      stepDelta > 0 &&
      interEventElapsedMs >= 0 &&
      interEventElapsedMs < stepDelta * minimumStepIntervalMs;

    previousRawData = data;

    if (isSuspiciousBurst) {
      ignoredSteps += stepDelta;
      if (distanceDelta > 0) {
        ignoredDistance += distanceDelta;
      }
      return null;
    }

    if (ignoredSteps === 0 && ignoredDistance === 0) {
      return safeDistance === data.distance ? data : { ...data, distance: safeDistance };
    }

    return rebaseStepData(data);
  };
}

/**
 * If you're using a method or property that's not available on the current platform, throw this error.
 * @param {string} moduleName The name of the module.
 * @param {string} propertyName The name of the property.
 * @returns {Error} The error.
 * @example
 *  if (!StepCounter.startStepCounterUpdate) {
 *     throw new UnavailabilityError(NativeModuleName, eventName);
 *  }
 */
class UnavailabilityError extends Error {
  code: string;
  constructor(moduleName: string, propertyName: string) {
    super(
      `The method or property ${moduleName}.${propertyName} is not available on ${Platform.OS}, ` +
        "are you sure you've linked all the native dependencies properly?"
    );
    this.code = "ERR_UNAVAILABLE";
  }
}

function normalizeStepCounterError(payload: unknown): StepCounterError {
  if (payload && typeof payload === "object") {
    const errorPayload = payload as Record<string, unknown>;
    const message =
      typeof errorPayload.message === "string"
        ? errorPayload.message
        : typeof errorPayload.localizedDescription === "string"
          ? errorPayload.localizedDescription
          : String(payload);
    return {
      message,
      code: typeof errorPayload.code === "number" ? errorPayload.code : undefined,
      domain: typeof errorPayload.domain === "string" ? errorPayload.domain : undefined,
    };
  }
  return { message: String(payload ?? "Unknown error") };
}

/**
 * Returns whether the stepCounter is enabled on the device.
 * iOS 8.0+ only. Android is available since KitKat (4.4 / API 19).
 * @see https://developer.android.com/about/versions/android-4.4.html
 * @see https://developer.apple.com/documentation/coremotion/cmpedometer/1613963-isstepcountingavailable
 * @returns {Promise<StepCountingSupportResult>} A promise that resolves with step counter availability.
 * supported - Whether the stepCounter is supported on device.
 * granted - Whether user granted the permission.
 * working - Android only: whether the native sensor service is currently active.
 */
export function isStepCountingSupported(): Promise<StepCountingSupportResult> {
  return StepCounter.isStepCountingSupported();
}

/**
 * Query cumulative step data for a date range. iOS only (Core Motion `CMPedometer`).
 *
 * Apple retains roughly seven days of pedometer history. Ranges older than that may return
 * partial or empty data. This call does not stop or interfere with an active live session.
 *
 * @param start Start of the query range.
 * @param end End of the query range. Values in the future are clamped to the current time.
 */
export function queryPedometerDataBetweenDates(start: Date, end: Date): Promise<StepCountData> {
  if (Platform.OS !== "ios" || !StepCounter.queryPedometerDataBetweenDates) {
    throw new UnavailabilityError(NAME, "queryPedometerDataBetweenDates");
  }
  const startTime = start.getTime();
  const endTime = end.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return Promise.reject(new Error("start and end must be valid Date instances"));
  }
  if (startTime > endTime) {
    return Promise.reject(new Error("start must be before or equal to end"));
  }
  const now = Date.now();
  const endMs = Math.min(endTime, now);
  const startMs = Math.min(startTime, endMs);
  return StepCounter.queryPedometerDataBetweenDates(startMs, endMs);
}

/**
 * Returns whether this library currently has an active live step-count subscription.
 *
 * This reflects the session managed by `startStepCounterUpdate` / `stopStepCounterUpdate`,
 * not the Android `working` flag from `isStepCountingSupported()`.
 */
export function isSensorWorking(): boolean {
  return _activeSubscription !== null;
}

/**
 * Subscribe to native step counter errors (`StepCounter.errorOccurred`).
 */
export function addStepCounterErrorListener(
  callback: (error: StepCounterError) => void
): EventSubscription {
  return getStepEventEmitter().addListener(errorEventName, (payload) =>
    callback(normalizeStepCounterError(payload))
  );
}

/**
 * Subscribe to native sensor capability metadata (`StepCounter.stepsSensorInfo`).
 *
 * Emitted from `isStepCountingSupported()` on iOS and when the Android sensor service starts.
 */
export function addStepsSensorInfoListener(
  callback: (info: StepsSensorInfo) => void
): EventSubscription {
  return getStepEventEmitter().addListener(sensorInfoEventName, (payload) =>
    callback(payload as StepsSensorInfo)
  );
}

/**
 * Subscribe to motion detection signals (`StepCounter.stepDetected`).
 * Emitted from the native motion detector path (e.g. `SOMotionDetecter`), not from
 * cumulative `stepCounterUpdate` batches. Android may not emit during live sessions.
 */
export function addStepDetectedListener(
  callback: (detected: boolean) => void
): EventSubscription {
  return getStepEventEmitter().addListener(stepDetectedEventName, (payload) =>
    callback(Boolean(payload))
  );
}

/**
 * Subscribe to pedestrian pause/resume events (`StepCounter.pedometerEvent`).
 * iOS only — requires `CMPedometer.isPedometerEventTrackingAvailable`.
 * Native delivery starts with `startStepCounterUpdate` and stops with
 * `stopStepCounterUpdate`; subscribing alone does not start Core Motion event updates.
 */
export function addPedometerEventListener(
  callback: (event: PedometerEvent) => void
): EventSubscription {
  return getStepEventEmitter().addListener(pedometerEventName, (payload) => {
    const event = payload as PedometerEvent;
    if (event?.type === "pause" || event?.type === "resume") {
      callback(event);
    }
  });
}

/**
 * Start to subscribe stepCounter updates.
 * Only the past seven days worth of data is stored and available for you to retrieve.
 * Specifying a start date that is more than seven days in the past returns only the available data.
 * ### iOS
 * `CMStepCounter.startStepCountingUpdates` is deprecated since iOS 8.0. so used `CMPedometer.startUpdates` instead.
 * @see https://developer.apple.com/documentation/coremotion/cmpedometer/1613950-startupdates
 * @see https://developer.apple.com/documentation/coremotion/cmstepcounter/1616151-startstepcountingupdates
 * On iOS, `steps` and `distance` are both cumulative for `[start, now]`.
 * @param {Date} start A date indicating the start of the range over which to measure steps.
 * @param {StepCountUpdateCallback} callBack - This callback function makes it easy for app developers to receive sensor events.
 * @returns {EventSubscription} - Returns a Subscription that enables you to call.
 * When you would like to unsubscribe the listener, just use a method of subscriptions's `remove()`.
 * @example
 * const startDate = new Date();
 * subscriptionRef.current = startStepCounterUpdate(startDate, (response) => {
 *    const data = parseStepCountData(response);
 * })
 */
export function startStepCounterUpdate(
  start: Date,
  callBack: StepCountUpdateCallback
): EventSubscription {
  if (!StepCounter.startStepCounterUpdate) {
    throw new UnavailabilityError(NAME, eventName);
  }
  // Clean up any previous subscription registered by this library before creating a new one.
  _activeSubscription?.remove();
  _activeSubscription = null;
  const from = start.getTime();
  _activeSubscription = getStepEventEmitter().addListener(eventName, (data) =>
    callBack(data as StepCountData)
  );
  StepCounter.startStepCounterUpdate(from);
  return _activeSubscription;
}

/**
 * Stop the step counter updates.
 * ### iOS
 * `CMStepCounter.stopStepCountingUpdates` is deprecated since iOS 8.0. so used `CMPedometer.stopUpdates` instead.
 * @see https://developer.apple.com/documentation/coremotion/cmpedometer/1613973-stopupdates
 * @see https://developer.apple.com/documentation/coremotion/cmstepcounter/1616157-stopstepcountingupdates
 */
export function stopStepCounterUpdate(): void {
  // Remove only the subscription registered by this library, not all listeners.
  // Calling removeAllListeners would break external subscribers such as debug log components.
  _activeSubscription?.remove();
  _activeSubscription = null;
  StepCounter.stopStepCounterUpdate();
}

export {
  errorEventName,
  eventName,
  NAME,
  pedometerEventName,
  sensorInfoEventName,
  stepDetectedEventName,
  VERSION,
  type CounterType,
  type MotionAuthorizationStatus,
  type PedometerEvent,
  type PedometerEventType,
  type StepCountData,
  type StepCountingSupportResult,
  type StepCounterError,
  type StepsSensorInfo,
};
