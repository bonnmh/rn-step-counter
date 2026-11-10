import { Platform, TurboModuleRegistry } from "react-native";

// Static imports work for pure functions — the native module is not invoked at call time.
import {
  createStepCountFilter,
  parseStepData,
  NAME,
  VERSION,
  type CounterType,
  type StepCountData,
} from "../index";
import {
  errorEventName,
  eventName,
  pedometerEventName,
  sensorInfoEventName,
  stepDetectedEventName,
} from "../NativeStepCounter";

// ─── helpers ────────────────────────────────────────────────────────────────

type NativeMock = {
  isStepCountingSupported: jest.Mock;
  queryPedometerDataBetweenDates: jest.Mock | undefined;
  startStepCounterUpdate: jest.Mock | undefined;
  stopStepCounterUpdate: jest.Mock;
  addListener: jest.Mock;
  removeListeners: jest.Mock;
};

/** Build a complete native module mock with sensible defaults. */
function makeNativeMock(overrides: Partial<NativeMock> = {}): NativeMock {
  return {
    isStepCountingSupported: jest.fn().mockResolvedValue({ supported: true, granted: true }),
    queryPedometerDataBetweenDates: jest.fn().mockResolvedValue({
      counterType: "CMPedometer",
      steps: 1234,
      startDate: 1700000000000,
      endDate: 1700003600000,
      distance: 900,
    }),
    startStepCounterUpdate: jest.fn(),
    stopStepCounterUpdate: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    ...overrides,
  };
}

/**
 * Load a fresh copy of src/index via jest.isolateModules so that
 * TurboModuleRegistry.getEnforcing returns `nativeMock` when the module
 * initialises its StepCounter reference.
 */
function loadModule(nativeMock: NativeMock): typeof import("../index") {
  let mod: typeof import("../index") | undefined;
  jest.isolateModules(() => {
    (TurboModuleRegistry.getEnforcing as jest.Mock).mockReturnValue(nativeMock);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../index") as typeof import("../index");
  });
  if (!mod) throw new Error("isolateModules did not load the module");
  return mod;
}

// ─── constants ───────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it('NAME is "StepCounter"', () => {
    expect(NAME).toBe("StepCounter");
  });

  it('VERSION is "2.0.0"', () => {
    expect(VERSION).toBe("2.0.0");
  });

  it('eventName is "StepCounter.stepCounterUpdate"', () => {
    expect(eventName).toBe("StepCounter.stepCounterUpdate");
  });

  it("exports auxiliary event name constants", () => {
    expect(errorEventName).toBe("StepCounter.errorOccurred");
    expect(sensorInfoEventName).toBe("StepCounter.stepsSensorInfo");
    expect(stepDetectedEventName).toBe("StepCounter.stepDetected");
    expect(pedometerEventName).toBe("StepCounter.pedometerEvent");
  });
});

// ─── parseStepData ───────────────────────────────────────────────────────────

describe("parseStepData", () => {
  // 1700000000000 ms = 2023-11-14T22:13:20.000Z
  // 1700003600000 ms = 2023-11-14T23:13:20.000Z  (process.env.TZ = "UTC" in jest.config.js)
  const base: StepCountData = {
    counterType: "STEP_COUNTER",
    steps: 5000,
    startDate: 1700000000000,
    endDate: 1700003600000,
    distance: 3750.5,
  };

  it("exposes raw step count and stepsString", () => {
    const result = parseStepData(base);
    expect(result.steps).toBe(5000);
    expect(result.stepsString).toBe("5000 steps");
  });

  it("calculates calories as steps × 0.045 kCal", () => {
    expect(parseStepData(base).calories).toBe("225.00kCal");
  });

  it("formats distance with one decimal place", () => {
    expect(parseStepData(base).distance).toBe("3750.5m");
    expect(parseStepData({ ...base, distance: 1234 }).distance).toBe("1234.0m");
  });

  it('shows "Goal Reached" when steps >= 10 000', () => {
    expect(parseStepData({ ...base, steps: 10000 }).dailyGoal).toBe("Goal Reached");
    expect(parseStepData({ ...base, steps: 15000 }).dailyGoal).toBe("Goal Reached");
  });

  it("shows X/10000 progress when steps < 10 000", () => {
    expect(parseStepData(base).dailyGoal).toBe("5000/10000 steps");
  });

  it("formats timestamps as HH:MM:SS strings (en-gb locale, UTC)", () => {
    const result = parseStepData(base);
    expect(result.startDate).toBe("22:13:20");
    expect(result.endDate).toBe("23:13:20");
  });

  it("falls back safely when distance or steps are non-finite", () => {
    const malformed = {
      ...base,
      distance: Number.NaN,
    };
    expect(parseStepData(malformed).distance).toBe("0.0m");
  });
});

// ─── createStepCountFilter ───────────────────────────────────────────────────

describe("createStepCountFilter", () => {
  const startDate = 1700000000000;

  function stepData(
    steps: number,
    endOffsetMs: number,
    counterType: CounterType = "STEP_COUNTER"
  ): StepCountData {
    return {
      counterType,
      steps,
      startDate,
      endDate: startDate + endOffsetMs,
      distance: steps * 0.762,
    };
  }

  it("drops rotation-like bursts that exceed the configured cadence", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(filter(stepData(1, 100, "ACCELEROMETER"))).toBeNull();
    expect(filter(stepData(2, 180, "ACCELEROMETER"))).toBeNull();

    const next = filter(stepData(3, 1000, "ACCELEROMETER"));

    expect(next?.steps).toBe(1);
    expect(next?.distance).toBeCloseTo(0.762);
  });

  it("drops Android rotation bursts even hours after startOfToday", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });
    const fourHoursMs = 4 * 60 * 60 * 1000;

    expect(filter(stepData(1000, fourHoursMs, "ACCELEROMETER"))?.steps).toBe(1000);
    // 2 false steps in 80ms hours after session start must still be rejected
    expect(filter(stepData(1002, fourHoursMs + 80, "ACCELEROMETER"))).toBeNull();
    // Legitimate step 400ms later is rebased cleanly
    const next = filter(stepData(1003, fourHoursMs + 480, "ACCELEROMETER"));
    expect(next?.steps).toBe(1001);
  });

  it("keeps normal walking cadence unchanged", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(filter(stepData(1, 300))?.steps).toBe(1);
    expect(filter(stepData(2, 650))?.steps).toBe(2);
    expect(filter(stepData(3, 1000))?.steps).toBe(3);
  });

  it("keeps STEP_COUNTER hardware batches that arrive close together", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(filter(stepData(100, 1000, "STEP_COUNTER"))?.steps).toBe(100);
    expect(filter(stepData(108, 1400, "STEP_COUNTER"))?.steps).toBe(108);
    expect(filter(stepData(109, 1800, "STEP_COUNTER"))?.steps).toBe(109);
  });

  it("keeps CMPedometer batch updates that arrive close together", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });
    const fourHoursMs = 4 * 60 * 60 * 1000;

    expect(filter(stepData(4000, fourHoursMs, "CMPedometer"))?.steps).toBe(4000);
    expect(filter(stepData(4500, fourHoursMs + 50, "CMPedometer"))?.steps).toBe(4500);
  });

  it("keeps initial CMPedometer seed batches right after midnight", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(filter(stepData(12, 500, "CMPedometer"))?.steps).toBe(12);
    expect(filter(stepData(15, 550, "CMPedometer"))?.steps).toBe(15);
  });

  it("passes through when disabled", () => {
    const filter = createStepCountFilter({ enabled: false, minimumStepIntervalMs: 250 });

    expect(filter(stepData(1, 100))?.steps).toBe(1);
    expect(filter(stepData(80, 120))?.steps).toBe(80);
  });

  it("resets ignored burst offsets when upgrading from ACCELEROMETER to STEP_COUNTER", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    // Reject 3 accelerometer burst steps -> ignoredSteps = 3
    expect(filter(stepData(3, 100, "ACCELEROMETER"))).toBeNull();

    // User grants permission -> sensor upgrades to STEP_COUNTER with cumulative 5 steps (>= 3)
    const upgraded = filter(stepData(5, 800, "STEP_COUNTER"));
    expect(upgraded?.steps).toBe(5);
    expect(upgraded?.distance).toBeCloseTo(5 * 0.762);
  });

  it("resets ignored burst offsets when startDate changes to a new session", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(filter(stepData(2, 80, "ACCELEROMETER"))).toBeNull();

    const nextSessionStart = startDate + 60_000;
    const freshSessionStep = filter({
      counterType: "ACCELEROMETER",
      steps: 2,
      startDate: nextSessionStart,
      endDate: nextSessionStart + 600,
      distance: 2 * 0.762,
      calories: 2 * 0.045,
    });
    expect(freshSessionStep?.steps).toBe(2);
    expect(freshSessionStep?.calories).toBeCloseTo(2 * 0.045);
  });

  it("rebases calories alongside steps and distance after a rejected burst", () => {
    const filter = createStepCountFilter({ minimumStepIntervalMs: 250 });

    expect(
      filter({ ...stepData(2, 100, "ACCELEROMETER"), calories: 2 * 0.045 })
    ).toBeNull();

    const accepted = filter({
      ...stepData(4, 900, "ACCELEROMETER"),
      calories: 4 * 0.045,
    });
    expect(accepted?.steps).toBe(2);
    expect(accepted?.calories).toBeCloseTo(2 * 0.045);
  });
});

describe("lazy NativeEventEmitter initialization", () => {
  it("allows importing pure helpers without throwing when native module is null", () => {
    let loaded: typeof import("../index") | undefined;
    expect(() => {
      jest.isolateModules(() => {
        (TurboModuleRegistry.getEnforcing as jest.Mock).mockReturnValue(null);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require("../index") as typeof import("../index");
      });
    }).not.toThrow();

    expect(loaded?.VERSION).toBe("2.0.0");
    expect(loaded?.createStepCountFilter()(
      { counterType: "CMPedometer", steps: 10, startDate: 1000, endDate: 2000, distance: 7.5 }
    )?.steps).toBe(10);
  });
});

// ─── isStepCountingSupported ─────────────────────────────────────────────────

describe("isStepCountingSupported", () => {
  it("resolves with the native module's supported/granted result", async () => {
    const mockResult = { supported: true, granted: true };
    const nativeMock = makeNativeMock({
      isStepCountingSupported: jest.fn().mockResolvedValue(mockResult),
    });
    const { isStepCountingSupported } = loadModule(nativeMock);

    await expect(isStepCountingSupported()).resolves.toEqual(mockResult);
  });

  it("forwards an unsupported/not-granted result without modification", async () => {
    const nativeMock = makeNativeMock({
      isStepCountingSupported: jest.fn().mockResolvedValue({
        supported: false,
        granted: false,
        authorizationStatus: "denied",
      }),
    });
    const { isStepCountingSupported } = loadModule(nativeMock);

    const result = await isStepCountingSupported();
    expect(result.supported).toBe(false);
    expect(result.granted).toBe(false);
    expect(result.authorizationStatus).toBe("denied");
  });
});

// ─── startStepCounterUpdate ──────────────────────────────────────────────────

describe("startStepCounterUpdate", () => {
  it("registers an event listener and triggers native updates", () => {
    const nativeMock = makeNativeMock();
    const { startStepCounterUpdate } = loadModule(nativeMock);
    const startDate = new Date(1700000000000);

    const subscription = startStepCounterUpdate(startDate, jest.fn());

    expect(typeof subscription.remove).toBe("function");
    expect(nativeMock.addListener).toHaveBeenCalledWith(eventName);
    expect(nativeMock.startStepCounterUpdate).toHaveBeenCalledWith(startDate.getTime());
  });

  it("removes the previous subscription before creating a new one", () => {
    const nativeMock = makeNativeMock();
    const { startStepCounterUpdate } = loadModule(nativeMock);

    startStepCounterUpdate(new Date(), jest.fn());
    startStepCounterUpdate(new Date(), jest.fn());

    // Two starts → two addListener calls
    expect(nativeMock.addListener).toHaveBeenCalledTimes(2);
    // First subscription's remove() triggers removeListeners(1) inside NativeEventEmitter
    expect(nativeMock.removeListeners).toHaveBeenCalledTimes(1);
  });

  it("throws an UnavailabilityError when the native method is absent", () => {
    const nativeMock = makeNativeMock({ startStepCounterUpdate: undefined });
    const { startStepCounterUpdate } = loadModule(nativeMock);

    expect(() => startStepCounterUpdate(new Date(), jest.fn())).toThrow(
      expect.objectContaining({ code: "ERR_UNAVAILABLE" })
    );
  });
});

// ─── stopStepCounterUpdate ───────────────────────────────────────────────────

describe("stopStepCounterUpdate", () => {
  it("removes the active subscription and calls native stop", () => {
    const nativeMock = makeNativeMock();
    const { startStepCounterUpdate, stopStepCounterUpdate } = loadModule(nativeMock);

    startStepCounterUpdate(new Date(), jest.fn());
    stopStepCounterUpdate();

    expect(nativeMock.removeListeners).toHaveBeenCalledTimes(1);
    expect(nativeMock.stopStepCounterUpdate).toHaveBeenCalled();
  });

  it("is safe to call when no subscription is active", () => {
    const nativeMock = makeNativeMock();
    const { stopStepCounterUpdate } = loadModule(nativeMock);

    expect(() => stopStepCounterUpdate()).not.toThrow();
    expect(nativeMock.stopStepCounterUpdate).toHaveBeenCalled();
  });
});

// ─── queryPedometerDataBetweenDates ──────────────────────────────────────────

describe("queryPedometerDataBetweenDates", () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatformOS });
    jest.restoreAllMocks();
  });

  it("forwards millisecond timestamps to native on iOS", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const nativeMock = makeNativeMock();
    const { queryPedometerDataBetweenDates: query } = loadModule(nativeMock);
    const start = new Date("2024-01-01T00:00:00.000Z");
    const end = new Date("2024-01-01T12:00:00.000Z");

    await query(start, end);

    expect(nativeMock.queryPedometerDataBetweenDates).toHaveBeenCalledWith(
      start.getTime(),
      end.getTime()
    );
  });

  it("clamps end dates in the future to now", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700003600000);
    const nativeMock = makeNativeMock();
    const { queryPedometerDataBetweenDates: query } = loadModule(nativeMock);
    const start = new Date(1700000000000);
    const end = new Date(1700007200000);

    await query(start, end);

    expect(nativeMock.queryPedometerDataBetweenDates).toHaveBeenCalledWith(
      start.getTime(),
      1700003600000
    );
    nowSpy.mockRestore();
  });

  it("clamps start date to endMs when both start and end are slightly ahead of Date.now()", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700003600000);
    const nativeMock = makeNativeMock();
    const { queryPedometerDataBetweenDates: query } = loadModule(nativeMock);
    const start = new Date(1700003600005);
    const end = new Date(1700003600010);

    await query(start, end);

    expect(nativeMock.queryPedometerDataBetweenDates).toHaveBeenCalledWith(
      1700003600000,
      1700003600000
    );
    nowSpy.mockRestore();
  });

  it("throws an UnavailabilityError on Android", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    const { queryPedometerDataBetweenDates: query } = loadModule(makeNativeMock());

    expect(() => query(new Date(), new Date())).toThrow(
      expect.objectContaining({ code: "ERR_UNAVAILABLE" })
    );
  });

  it("throws an UnavailabilityError when the native method is absent", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const nativeMock = makeNativeMock({ queryPedometerDataBetweenDates: undefined });
    const { queryPedometerDataBetweenDates: query } = loadModule(nativeMock);

    expect(() => query(new Date(), new Date())).toThrow(
      expect.objectContaining({ code: "ERR_UNAVAILABLE" })
    );
  });

  it("rejects when start is after end", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const { queryPedometerDataBetweenDates: query } = loadModule(makeNativeMock());

    await expect(
      query(new Date("2024-01-02T00:00:00.000Z"), new Date("2024-01-01T00:00:00.000Z"))
    ).rejects.toThrow("start must be before or equal to end");
  });
});

// ─── isSensorWorking ─────────────────────────────────────────────────────────

describe("isSensorWorking", () => {
  it("is false before starting and true while a session is active", () => {
    const { isSensorWorking: isWorking, startStepCounterUpdate, stopStepCounterUpdate } =
      loadModule(makeNativeMock());

    expect(isWorking()).toBe(false);
    startStepCounterUpdate(new Date(), jest.fn());
    expect(isWorking()).toBe(true);
    stopStepCounterUpdate();
    expect(isWorking()).toBe(false);
  });
});

// ─── event listener helpers ──────────────────────────────────────────────────

describe("event listener helpers", () => {
  it("register native listeners for error, sensor info, step detected, and pedometer events", () => {
    const nativeMock = makeNativeMock();
    const {
      addStepCounterErrorListener,
      addStepsSensorInfoListener,
      addStepDetectedListener,
      addPedometerEventListener,
    } = loadModule(nativeMock);

    addStepCounterErrorListener(jest.fn());
    addStepsSensorInfoListener(jest.fn());
    addStepDetectedListener(jest.fn());
    addPedometerEventListener(jest.fn());

    expect(nativeMock.addListener).toHaveBeenCalledWith(errorEventName);
    expect(nativeMock.addListener).toHaveBeenCalledWith(sensorInfoEventName);
    expect(nativeMock.addListener).toHaveBeenCalledWith(stepDetectedEventName);
    expect(nativeMock.addListener).toHaveBeenCalledWith(pedometerEventName);
  });
});
