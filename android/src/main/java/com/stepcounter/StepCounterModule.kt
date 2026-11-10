package com.stepcounter

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import com.stepcounter.services.AccelerometerService
import com.stepcounter.services.SensorListenService
import com.stepcounter.services.StepCounterService
import com.stepcounter.utils.AndroidVersionHelper

/**
 * This class is the native module for the react-native-step-counter package.
 *
 * It is responsible for the communication between the native and the react-native code.
 * @param reactContext The context of the react-native application
 * @property appContext The context of the react-native application from [context][com.facebook.react.bridge.ReactApplicationContext]
 * @property sensorManager The sensor manager that is responsible for the sensor
 * @property stepCounterListener The service that is responsible for the step counter sensor
 * @constructor Creates a new StepCounterModule implements StepCounterSpec
 * @see ReactContextBaseJavaModule
 * @see ReactApplicationContext
 * @see NativeStepCounterSpec
 */
class StepCounterModule(
  reactContext: ReactApplicationContext,
) : NativeStepCounterSpec(reactContext) {
  companion object {
    const val NAME: String = NativeStepCounterSpec.NAME
    private val TAG_NAME: String = StepCounterModule::class.java.name
    private const val STEP_COUNTER = "android.permission.ACTIVITY_RECOGNITION"
  }

  private val appContext: ReactApplicationContext = reactContext
  private var sensorManager: SensorManager =
    reactContext.getSystemService(
      Context.SENSOR_SERVICE,
    ) as SensorManager

  private val stepsOK: Boolean
    get() =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContextCompat.checkSelfPermission(appContext, STEP_COUNTER) == PackageManager.PERMISSION_GRANTED
      } else {
        true
      }

  private val hasHardwareStepCounter: Boolean
    get() =
      AndroidVersionHelper.isHardwareStepCounterEnabled(appContext) &&
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

  private val hasHardwareAccelerometer: Boolean
    get() =
      AndroidVersionHelper.isHardwareAccelerometerEnabled(appContext) &&
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null

  private val supported: Boolean
    get() = hasHardwareStepCounter || hasHardwareAccelerometer

  private val permissionGranted: Boolean
    get() = if (hasHardwareStepCounter) stepsOK else hasHardwareAccelerometer

  private val authorizationStatus: String
    get() = if (permissionGranted) "authorized" else "unknown"

  private val walkingStatus: Boolean
    get() = stepCounterListener?.isListening == true

  private var stepCounterListener: SensorListenService? = null

  private fun ensureSensorService(): SensorListenService? {
    val current = stepCounterListener
    if (hasHardwareStepCounter && stepsOK) {
      if (current is StepCounterService) {
        return current
      }
      if (current != null) {
        current.stopService()
        appContext.removeLifecycleEventListener(current)
      }
      return StepCounterService(this, sensorManager, appContext).also {
        stepCounterListener = it
        appContext.addLifecycleEventListener(it)
      }
    }

    if (hasHardwareAccelerometer) {
      if (current is AccelerometerService) {
        return current
      }
      if (current != null) {
        current.stopService()
        appContext.removeLifecycleEventListener(current)
      }
      return AccelerometerService(this, sensorManager).also {
        stepCounterListener = it
        appContext.addLifecycleEventListener(it)
      }
    }

    return null
  }

  /**
   * Ask whether step counting is supported and permission is granted on the device.
   */
  @ReactMethod
  override fun isStepCountingSupported(promise: Promise) {
    Log.d(TAG_NAME, "hardware_step_counter? $hasHardwareStepCounter")
    Log.d(TAG_NAME, "step_counter granted? $stepsOK")
    Log.d(TAG_NAME, "accelerometer available? $hasHardwareAccelerometer")
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("supported", supported)
        putBoolean("granted", permissionGranted)
        putString("authorizationStatus", authorizationStatus)
        putBoolean("working", walkingStatus)
      },
    )
  }

  /**
   * Start the step counter sensor.
   * @param from timestamp in milliseconds (or seconds for backward compatibility)
   */
  @ReactMethod
  override fun startStepCounterUpdate(from: Double) {
    val sessionStartMillis = normalizeStartTimestampToMillis(from)
    val service = ensureSensorService()
    if (service == null) {
      sendDeviceEvent(
        "errorOccurred",
        Arguments.createMap().apply {
          putString("message", "No compatible step or accelerometer sensor available on this device")
        },
      )
      return
    }
    Log.d(TAG_NAME, "startStepCounterUpdate")
    service.startService(sessionStartMillis)
  }

  /**
   * Stop the step counter sensor.
   */
  @ReactMethod
  override fun stopStepCounterUpdate() {
    Log.d(TAG_NAME, "stopStepCounterUpdate")
    stepCounterListener?.stopService()
  }

  override fun invalidate() {
    stepCounterListener?.let { listener ->
      listener.stopService()
      appContext.removeLifecycleEventListener(listener)
    }
    stepCounterListener = null
    super.invalidate()
  }

  @ReactMethod
  override fun queryPedometerDataBetweenDates(
    startDate: Double,
    endDate: Double,
    promise: Promise,
  ) {
    promise.reject(
      "ERR_UNAVAILABLE",
      "queryPedometerDataBetweenDates is not supported on Android",
    )
  }

  /**
   * Keep: Required for RN built in Event Emitter Support.
   * @param eventName the name of the event. usually "stepCounterUpdate".
   */
  @ReactMethod
  override fun addListener(eventName: String) {
  }

  /**
   * Keep: Required for RN built in Event Emitter Support.
   * @param count the number of listeners to remove.
   * not implemented.
   */
  @ReactMethod
  override fun removeListeners(count: Double) {
  }

  /**
   * StepCounterPackage requires this property for the module.
   * @return the name of the module. usually "StepCounter".
   */
  override fun getName(): String = NAME

  /**
   * Send the step counter update event to the react-native code.
   * @param eventPayload the object that contains information about the step counter update.
   * @return Nothing.
   * @see WritableMap
   * @see RCTDeviceEventEmitter
   * @see com.facebook.react.modules.core.DeviceEventManagerModule
   * @throws RuntimeException if the event emitter is not initialized.
   */
  fun sendDeviceEvent(
    eventType: String,
    eventPayload: Any,
  ) {
    try {
      appContext
        .getJSModule(RCTDeviceEventEmitter::class.java)
        .emit(eventName = "$NAME.$eventType", data = eventPayload)
    } catch (e: RuntimeException) {
      e.message?.let { Log.e(TAG_NAME, it) }
      Log.e(TAG_NAME, eventType, e)
    }
  }

  /**
   * JS passes ms; accept seconds too for backward-compat.
   */
  private fun normalizeStartTimestampToMillis(from: Double): Long {
    if (!from.isFinite() || from <= 0) {
      return System.currentTimeMillis()
    }
    return if (from >= 1_000_000_000_000.0) {
      from.toLong()
    } else {
      (from * 1000).toLong()
    }
  }
}
