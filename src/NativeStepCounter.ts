import { TurboModuleRegistry, type TurboModule } from "react-native";

export type CounterType = "STEP_COUNTER" | "ACCELEROMETER" | "CMPedometer";

/**
 * `StepCountData` is an object with four properties: `distance`, `steps`, `startDate`, and `endDate`.
 * StepCountData object - The Object that contains the step count data.
 * counterType - The type of counter used to count the steps.
 * steps - The number of steps taken during the time period.
 * startDate - The start date of the data.
 * endDate - The end date of the data.
 * distance - The distance in meters that the user has walked or run.
 * floorsAscended - number of floors ascended (iOS only)
 * floorsDescended - number of floors descended (iOS only)
 * calories - estimated calories burned (Android native; iOS may include estimated value)
 */
export type StepCountData = {
  counterType: CounterType;
  steps: number; // number of steps
  startDate: number; // Unix timestamp in milliseconds (long)
  endDate: number; // Unix timestamp in milliseconds (long)
  distance: number; // distance in meters (android: probably not accurate)
  floorsAscended?: number; // number of floors ascended (iOS only)
  floorsDescended?: number; // number of floors descended (iOS only)
  calories?: number;
};

export type StepCountingSupportResult = {
  supported: boolean;
  granted: boolean;
  /** Android only: whether the sensor service is currently active */
  working?: boolean;
};

export type StepCounterError = {
  message: string;
  code?: number;
  domain?: string;
};

export type StepsSensorInfoIOS = {
  name: string;
  granted: boolean;
  stepCounting: boolean;
  pace: boolean;
  cadence: boolean;
  distance: boolean;
  floorCounting: boolean;
};

export type StepsSensorInfoAndroid = {
  name: string;
  vendor: string;
  minDelay: number;
  maxDelay: number;
  power: number;
  resolution: number;
};

export type StepsSensorInfo = StepsSensorInfoIOS | StepsSensorInfoAndroid;

export const NAME = "StepCounter";
export const VERSION = "0.3.1";
export const eventName = "StepCounter.stepCounterUpdate";
export const errorEventName = "StepCounter.errorOccurred";
export const sensorInfoEventName = "StepCounter.stepsSensorInfo";
export const stepDetectedEventName = "StepCounter.stepDetected";

export interface Spec extends TurboModule {
  /**
   * @description Check if the step counter is supported on the device.
   * @async
   * @returns {Promise<StepCountingSupportResult>} Returns the `Promise` object,
   * including information such as whether the user's device has a step counter sensor by default (`supported`)
   * and whether the user has allowed the app to measure the pedometer data. (`granted`)
   * granted - The permission is granted or not.
   * supported - The step counter is supported or not.
   * @example
   * isStepCountingSupported().then((response) => {
   *   const { granted, supported } = response;
   *   setStepCountingSupported(supported);
   *   setStepCountingGranted(granted);
   * });
   */
  isStepCountingSupported(): Promise<StepCountingSupportResult>;
  /**
   * Query cumulative step data for a date range. iOS only (Core Motion).
   * @param startDate Unix timestamp in milliseconds.
   * @param endDate Unix timestamp in milliseconds.
   */
  queryPedometerDataBetweenDates(startDate: number, endDate: number): Promise<StepCountData>;
  /**
   * @param {number} from the current time obtained by `new Date()` in milliseconds.
   */
  startStepCounterUpdate(from: number): void;
  /**
   * Stop updating the step count data.
   * Removes all the listeners that were registered with `startStepCounterUpdate`.
   */
  stopStepCounterUpdate(): void;

  /* Required Methods for NativeEventEmitter */
  addListener(event: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("StepCounter");
