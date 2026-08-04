package com.paisaflow.sms

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * Read-only access to the SMS inbox via the SMS content resolver.
 *
 * Old-architecture-style bridge module — RN's interop layer exposes it on the
 * New Architecture, so no codegen spec is required. Parsing of bank/UPI
 * alerts happens 100% on-device in JS (src/services/sms/smsParser.ts); this
 * module only returns raw inbox rows.
 */
class SmsReaderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  /**
   * Returns up to [maxCount] newest inbox messages as
   * [{id, address, body, date}] (date = epoch ms). Rejects with E_PERMISSION
   * when READ_SMS has not been granted at runtime.
   */
  @ReactMethod
  fun getSmsInbox(maxCount: Int, promise: Promise) {
    // minSdk is 24, so Context.checkSelfPermission is always available —
    // no androidx.core dependency needed.
    if (reactContext.checkSelfPermission(Manifest.permission.READ_SMS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("E_PERMISSION", "READ_SMS permission not granted")
      return
    }
    try {
      val messages: WritableArray = Arguments.createArray()
      val cursor = reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        null,
        null,
        "date DESC",
      )
      cursor?.use {
        var count = 0
        while (it.moveToNext() && count < maxCount) {
          val message = Arguments.createMap()
          message.putString("id", it.getString(0) ?: "")
          message.putString("address", it.getString(1) ?: "")
          message.putString("body", it.getString(2) ?: "")
          // epoch ms as double — JS numbers have no 64-bit int.
          message.putDouble("date", it.getLong(3).toDouble())
          messages.pushMap(message)
          count++
        }
      }
      promise.resolve(messages)
    } catch (error: Exception) {
      promise.reject("E_SMS_READ", "Failed to read the SMS inbox", error)
    }
  }

  companion object {
    const val NAME = "SmsReader"
  }
}
