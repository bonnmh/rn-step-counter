package com.stepcounter.services

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.provider.Settings
import com.stepcounter.StepCounterModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * This class is responsible for listening to the hardware step counter sensor.
 * @param counterModule The module responsible for communicating with React Native
 * @param sensorManager The system [SensorManager]
 * @param appContext Android context used to persist session baselines across app restarts
 * @property sensorType Always [Sensor.TYPE_STEP_COUNTER]
 * @property sensorTypeString Always `"STEP_COUNTER"`
 * @property detectedSensor The detected hardware step counter sensor
 * @property currentSteps Cumulative steps counted in the active session
 */
class StepCounterService(
  counterModule: StepCounterModule,
  sensorManager: SensorManager,
  private val appContext: Context,
) : SensorListenService(counterModule, sensorManager) {
  override val sensorTypeString = "STEP_COUNTER"
  override val sensorType = Sensor.TYPE_STEP_COUNTER
  override val detectedSensor: Sensor? = sensorManager.getDefaultSensor(sensorType)
  private var baselineSteps: Double? = null
  private var accumulatedOffset: Double = 0.0
  override var currentSteps: Double = 0.0

  private val prefs by lazy {
    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  override fun resetSessionState() {
    val restored = loadPersistedSession(startDate)
    if (restored == null) {
      baselineSteps = null
      accumulatedOffset = 0.0
      currentSteps = 0.0
      return
    }

    val savedSteps =
      (restored.offset + (restored.lastRaw - restored.baseline).coerceAtLeast(0.0))
        .coerceAtLeast(0.0)
    val currentBootCount = resolveBootCount()
    val rebooted =
      restored.bootCount != UNKNOWN_BOOT_COUNT &&
        currentBootCount != UNKNOWN_BOOT_COUNT &&
        currentBootCount != restored.bootCount

    if (rebooted) {
      baselineSteps = null
      accumulatedOffset = savedSteps
      currentSteps = savedSteps
    } else {
      baselineSteps = restored.baseline.takeIf { it >= 0.0 }
      accumulatedOffset = restored.offset
      currentSteps = savedSteps
    }
  }

  /**
   * Update the cumulative step count relative to the session baseline.
   * Persists `(startDate, bootCount, baseline, lastRaw, offset)` so reopening the app
   * with the same `startDate` (e.g. `startOfToday()`) recovers steps counted by the
   * hardware `TYPE_STEP_COUNTER` while the process was stopped.
   */
  override fun updateCurrentSteps(
    eventData: FloatArray,
    eventTimestampNs: Long,
  ): Boolean {
    if (eventData.isEmpty()) {
      return false
    }
    val rawSteps = eventData[0].toDouble()
    if (!rawSteps.isFinite() || rawSteps < 0.0) {
      return false
    }

    val currentBaseline = baselineSteps
    if (currentBaseline == null) {
      baselineSteps = rawSteps
      persistSession(startDate, rawSteps, rawSteps, accumulatedOffset)
      return false
    }

    // Handle sensor reset / reboot while keeping monotonic session progress.
    if (rawSteps < currentBaseline) {
      accumulatedOffset = currentSteps
      baselineSteps = rawSteps
      persistSession(startDate, rawSteps, rawSteps, accumulatedOffset)
      return false
    }

    val totalSteps = accumulatedOffset + (rawSteps - currentBaseline)
    if (totalSteps <= currentSteps) {
      return false
    }

    currentSteps = totalSteps
    persistSession(startDate, currentBaseline, rawSteps, accumulatedOffset)
    return true
  }

  private fun resolveBootCount(): Long =
    try {
      Settings.Global.getInt(appContext.contentResolver, Settings.Global.BOOT_COUNT, -1).toLong()
    } catch (_: Throwable) {
      UNKNOWN_BOOT_COUNT
    }

  private data class PersistedSession(
    val startDateMs: Long,
    val bootCount: Long,
    val baseline: Double,
    val lastRaw: Double,
    val offset: Double,
  )

  private fun loadPersistedSession(targetStartDateMs: Long): PersistedSession? {
    val rawJson = prefs.getString(KEY_SESSIONS, null) ?: return null
    return try {
      val array = JSONArray(rawJson)
      for (i in 0 until array.length()) {
        val item = array.optJSONObject(i) ?: continue
        if (item.optLong("startDateMs", -1L) == targetStartDateMs) {
          return PersistedSession(
            startDateMs = targetStartDateMs,
            bootCount = item.optLong("bootCount", UNKNOWN_BOOT_COUNT),
            baseline = java.lang.Double.longBitsToDouble(item.getLong("baselineBits")),
            lastRaw = java.lang.Double.longBitsToDouble(item.getLong("lastRawBits")),
            offset = java.lang.Double.longBitsToDouble(item.optLong("offsetBits", 0L)),
          )
        }
      }
      null
    } catch (_: Throwable) {
      null
    }
  }

  private fun persistSession(
    sessionStartDateMs: Long,
    baseline: Double,
    lastRaw: Double,
    offset: Double,
  ) {
    try {
      val updated = JSONArray()
      updated.put(
        JSONObject().apply {
          put("startDateMs", sessionStartDateMs)
          put("bootCount", resolveBootCount())
          put("baselineBits", java.lang.Double.doubleToRawLongBits(baseline))
          put("lastRawBits", java.lang.Double.doubleToRawLongBits(lastRaw))
          put("offsetBits", java.lang.Double.doubleToRawLongBits(offset))
        },
      )

      val existingRaw = prefs.getString(KEY_SESSIONS, null)
      if (existingRaw != null) {
        val existing = JSONArray(existingRaw)
        for (i in 0 until existing.length()) {
          if (updated.length() >= MAX_PERSISTED_SESSIONS) {
            break
          }
          val item = existing.optJSONObject(i) ?: continue
          if (item.optLong("startDateMs", -1L) != sessionStartDateMs) {
            updated.put(item)
          }
        }
      }

      prefs.edit().putString(KEY_SESSIONS, updated.toString()).apply()
    } catch (_: Throwable) {
      // Best-effort persistence must never disrupt live sensor updates.
    }
  }

  companion object {
    private const val PREFS_NAME = "com.blife.rnstepcounter.sessions"
    private const val KEY_SESSIONS = "step_counter_sessions_v1"
    private const val MAX_PERSISTED_SESSIONS = 3
    private const val UNKNOWN_BOOT_COUNT = -1L
  }
}
