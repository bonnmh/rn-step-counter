package com.stepcounter.services

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.WritableMap
import com.stepcounter.StepCounterModule
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * the base class for sensor listen service
 * @param counterModule the step counter module
 * @param sensorManager the sensor manager
 * @see StepCounterModule
 * @see Sensor
 * @see SensorEvent
 * @see <a href="https://developer.android.com/reference/android/hardware/SensorEventListener">SensorEventListener</a>
 * @see <a href="https://developer.android.com/reference/android/hardware/SensorManager">SensorManager</a>
 * @see <a href="https://reactnative.dev/docs/native-modules-android#listening-to-lifecycle-events">LifecycleEventListener: document</a>
 * @see <a href="https://github.com/facebook/react-native/blob/main/ReactAndroid/src/main/java/com/facebook/react/bridge/LifecycleEventListener.java">LifecycleEventListener: original file</a>
 */
abstract class SensorListenService(
  private val counterModule: StepCounterModule,
  private val sensorManager: SensorManager,
) : SensorEventListener,
  LifecycleEventListener {
  /**
   * the accelerometer sensor type
   * [TYPE_ACCELEROMETER][Sensor.TYPE_ACCELEROMETER]: 1<br/>
   *
   * the step counter sensor type
   * [TYPE_STEP_COUNTER][Sensor.TYPE_STEP_COUNTER]: 19<br/>
   */
  abstract val sensorType: Int

  /**
   * The `rate` of [sensor events][android.hardware.SensorEvent] are
   * delivered at. This is only a hint to the system. Events may be received faster or
   * slower than the specified rate. Usually events are received faster.
   *
   * [samplingPeriodUs] – The desired delay between two consecutive events in microseconds.
   * This is only a hint to the system. Events may be received faster or slower than the specified rate.
   * Typically, events are received faster. Can be one of [SENSOR_DELAY_NORMAL][SensorManager.SENSOR_DELAY_NORMAL], [SENSOR_DELAY_UI][SensorManager.SENSOR_DELAY_UI],
   * [SENSOR_DELAY_GAME][SensorManager.SENSOR_DELAY_GAME], or [SENSOR_DELAY_FASTEST][SensorManager.SENSOR_DELAY_FASTEST]
   * or, the desired delay between events in microseconds. Specifying the delay in microseconds only works
   * from Android 2.3 (API level 9) onwards. For earlier releases, you must use one of the `SENSOR_DELAY_*` constants.
   *
   * @see
   * The following are the constants for the sampling period in microseconds
   * <pre class="prettyprint kotlin">
   * private fun getDelay(rate: Int): Int {
   *     return when (rate) {
   *         SensorManager.SENSOR_DELAY_FASTEST -> 0
   *         SensorManager.SENSOR_DELAY_GAME -> 20000
   *         SensorManager.SENSOR_DELAY_UI -> 66667
   *         SensorManager.SENSOR_DELAY_NORMAL -> 200000
   *         else -> rate
   *     }
   * }
   * </pre>
   */
  private val samplingPeriodUs
    get() =
      when (sensorType) {
        Sensor.TYPE_ACCELEROMETER -> SensorManager.SENSOR_DELAY_GAME
        Sensor.TYPE_STEP_COUNTER -> SensorManager.SENSOR_DELAY_NORMAL
        else -> SensorManager.SENSOR_DELAY_UI
      }

  /**
   * @return `"ACCELEROMETER"` when [detectedSensor] is [Sensor.TYPE_ACCELEROMETER],
   * or `"STEP_COUNTER"` when [Sensor.TYPE_STEP_COUNTER].
   */
  abstract val sensorTypeString: String

  /**
   * the detected sensor
   * @see SensorManager.getDefaultSensor
   * @see SensorManager.getSensorList
   * @see Sensor.TYPE_ACCELEROMETER
   * @see Sensor.TYPE_STEP_COUNTER
   */
  abstract val detectedSensor: Sensor?

  /**
   * the current steps data of the user
   * @see currentSteps
   * @see distance
   * @see lastEventEpochMs
   * @see sensorTypeString
   * @see calories
   * @see WritableMap
   * @see Arguments.createMap
   */
  val stepsParamsMap: WritableMap
    get() =
      Arguments.createMap().apply {
        putInt("steps", currentSteps.roundToInt())
        putNumber("distance", distance)
        putNumber("startDate", startDate)
        putNumber("endDate", lastEventEpochMs)
        putString("counterType", sensorTypeString)
        putNumber("calories", calories)
      }

  private fun buildStepsSensorInfo(sensor: Sensor): WritableMap =
    Arguments.createMap().apply {
      putNumber("minDelay", sensor.minDelay)
      putNumber("maxDelay", sensor.maxDelay)
      putString("name", sensor.name)
      putString("vendor", sensor.vendor)
      putNumber("power", sensor.power)
      putNumber("resolution", sensor.resolution)
      putBoolean("wakeUpSensor", sensor.isWakeUpSensor)
      putBoolean("additionalInfoSupported", sensor.isAdditionalInfoSupported)
    }

  /**
   * Number of in-database-saved calories.
   * 0.045 is the average calories burned per step.
   */
  private val calories: Double
    get() = currentSteps * 0.045

  /**
   * Distance of in-database-saved steps
   */
  private val distance: Double
    get() = currentSteps * 0.762

  /**
   * Number of steps counted since service start
   */
  abstract var currentSteps: Double

  /**
   * Whether the underlying Android sensor listener is currently registered.
   */
  var isListening: Boolean = false
    private set

  /**
   * Reset in-memory session state before a new counting session starts.
   */
  protected open fun resetSessionState() {
  }

  /**
   * Start date of the step counting. UTC milliseconds
   */
  protected var startDate: Long = System.currentTimeMillis()

  /**
   * End date of the latest accepted sensor event. UTC milliseconds
   */
  private var lastEventEpochMs: Long = System.currentTimeMillis()
  private var sensorClockAnchorNs: Long? = null
  private var wallClockAnchorMs: Long = 0L

  private fun resolveEventEpochMillis(eventTimestampNs: Long): Long {
    val nowWallMs = System.currentTimeMillis()
    val floorMs = startDate.coerceAtMost(nowWallMs)
    if (eventTimestampNs <= 0L) {
      return nowWallMs.coerceAtLeast(floorMs)
    }

    val elapsedNs = SystemClock.elapsedRealtimeNanos()
    val ageMs = TimeUnit.NANOSECONDS.toMillis(elapsedNs - eventTimestampNs)
    if (ageMs in -500L..10_000L) {
      return (nowWallMs - ageMs).coerceIn(floorMs, nowWallMs)
    }

    // Fallback for OEM sensor HALs that stamp events in CLOCK_MONOTONIC (which pauses
    // during deep sleep) instead of CLOCK_BOOTTIME (elapsedRealtimeNanos).
    val anchorNs = sensorClockAnchorNs
    if (anchorNs == null || eventTimestampNs < anchorNs) {
      sensorClockAnchorNs = eventTimestampNs
      wallClockAnchorMs = nowWallMs
      return nowWallMs.coerceAtLeast(floorMs)
    }

    val deltaMs = TimeUnit.NANOSECONDS.toMillis(eventTimestampNs - anchorNs)
    val anchoredWallMs = wallClockAnchorMs + deltaMs
    if (abs(nowWallMs - anchoredWallMs) > 5_000L) {
      sensorClockAnchorNs = eventTimestampNs
      wallClockAnchorMs = nowWallMs
      return nowWallMs.coerceAtLeast(floorMs)
    }

    return anchoredWallMs.coerceIn(floorMs, nowWallMs)
  }

  /**
   * Register the sensor listener and emit sensor capability info.
   */
  fun startService(startDateMillis: Long? = null) {
    val sensor = detectedSensor
    if (sensor == null) {
      isListening = false
      counterModule.sendDeviceEvent(
        "errorOccurred",
        Arguments.createMap().apply {
          putString("message", "Requested motion sensor ($sensorTypeString) is unavailable")
        },
      )
      return
    }

    sensorManager.unregisterListener(this)
    val nowMs = System.currentTimeMillis()
    startDate = startDateMillis?.takeIf { it > 0 }?.coerceAtMost(nowMs) ?: nowMs
    lastEventEpochMs = nowMs
    sensorClockAnchorNs = null
    wallClockAnchorMs = nowMs
    resetSessionState()
    val infoMap = buildStepsSensorInfo(sensor)
    counterModule.sendDeviceEvent("stepsSensorInfo", infoMap)
    Log.d(TAG_NAME, "SensorManager.stepsSensorInfo: $infoMap")
    isListening = sensorManager.registerListener(this, sensor, samplingPeriodUs)
    if (isListening) {
      counterModule.sendDeviceEvent("stepCounterUpdate", stepsParamsMap)
    }
  }

  /**
   * Unregister the active sensor listener.
   */
  fun stopService() {
    Log.d(TAG_NAME, "SensorListenService.stopService")
    sensorManager.unregisterListener(this)
    isListening = false
  }

  /**
   * Called when there is a new sensor event.  Note that "on changed"
   * is somewhat of a misnomer, as this will also be called if we have a
   * new reading from a sensor with the exact same sensor values (but a
   * newer timestamp).
   * See [SensorManager][android.hardware.SensorManager]
   * for details on possible sensor types.
   * See also [SensorEvent][android.hardware.SensorEvent].
   *
   * **NOTE1:** The application doesn't own the [event][android.hardware.SensorEvent]
   * object passed as a parameter and therefore cannot hold on to it.
   * The object may be part of an internal pool and may be reused by
   * the framework. If you need to hold on to the event, you must make a copy.
   *
   * **NOTE2:** Since the timestamp delivered from JavaScript is based on milliseconds,
   * mistakes can occur if the timestamp of sensor events recorded every moment in nanoseconds is delivered as it is.
   * Thus, we convert timestamp (nanoseconds recorded in sensor events) using [toMillis][java.util.concurrent.TimeUnit.toMillis] method,
   * or call [currentTimeInMillis][System.currentTimeMillis] method according to the function execution time.
   *
   * @param event the [SensorEvent][android.hardware.SensorEvent].
   * @see <a href="https://developer.android.com/reference/android/hardware/SensorEvent">Hardware Activity Sensors</a>
   * @see <a href="https://developer.android.com/reference/android/hardware/SensorEvent#sensor.type_accelerometer:">Accelerometer Sensor Event</a>
   * @see <a href="https://developer.android.com/reference/android/hardware/Sensor#TYPE_STEP_COUNTER">Step Counter Sensor Event</a>
   * @see <a href="https://developer.android.com/reference/android/hardware/Sensor#REPORTING_MODE_ON_CHANGE">Reporting Mode On Change</a>
   */
  override fun onSensorChanged(event: SensorEvent?) {
    if (event?.sensor == null ||
      event.sensor != detectedSensor ||
      event.sensor.type != sensorType ||
      detectedSensor?.type != event.sensor.type
    ) {
      return
    }
    if (updateCurrentSteps(event.values, event.timestamp)) {
      val nowWallMs = System.currentTimeMillis()
      val resolvedMs = resolveEventEpochMillis(event.timestamp)
      lastEventEpochMs =
        if (resolvedMs > lastEventEpochMs) {
          resolvedMs
        } else {
          minOf(nowWallMs, lastEventEpochMs + 1L).coerceAtLeast(lastEventEpochMs)
        }
      counterModule.sendDeviceEvent("stepCounterUpdate", stepsParamsMap)
    }
  }

  /**
   * Abstract method to update the current steps, implemented in [StepCounterService]
   * and [AccelerometerService] with sensor-specific algorithms.
   * @param eventData the detected vector of sensor event
   * @param eventTimestampNs hardware sensor event timestamp in nanoseconds
   * @return true if the current step count changed and should be emitted
   */
  abstract fun updateCurrentSteps(
    eventData: FloatArray,
    eventTimestampNs: Long,
  ): Boolean

  /**
   * Called when the accuracy of the registered sensor has changed.
   *
   * Unlike onSensorChanged(), this is only called when this accuracy value changes.
   * See the SENSOR_STATUS_* constants in
   * [SensorManager][android.hardware.SensorManager] for details.
   *
   * @param sensor The [Sensor][android.hardware.Sensor] that has accuracy changed.
   * @param accuracy The new accuracy of this sensor, one of
   * `SensorManager.SENSOR_STATUS_*`
   */
  override fun onAccuracyChanged(
    sensor: Sensor?,
    accuracy: Int,
  ) {
    Log.d(TAG_NAME, "onAccuracyChanged.accuracy $accuracy")
    Log.d(TAG_NAME, "onAccuracyChanged.sensor: $sensor")
  }

  /**
   * Called either when the host activity receives a resume event or
   * if the native module that implements this is initialized while the host activity is already
   * resumed. Always called for the most current activity.
   * @see Activity.onResume
   */
  override fun onHostResume() {
  }

  /**
   * Called when host activity receives pause event.
   * Always called for the most current activity.
   * @see Activity.onPause
   */
  override fun onHostPause() {
  }

  /**
   * Called when host activity receives destroy event.
   * Only called for the last React activity to be destroyed.
   * @see Activity.onDestroy
   */
  override fun onHostDestroy() {
    this.stopService()
  }

  companion object {
    val TAG_NAME: String = SensorListenService::class.java.name
  }
}

private fun WritableMap.putNumber(
  key: String,
  number: Number,
) {
  when (number) {
    is Double -> putDouble(key, number)
    is Int -> putInt(key, number)
    else -> putDouble(key, number.toDouble())
  }
}
