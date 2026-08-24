package com.concertthing.backgroundupload

import android.Manifest
import android.net.Uri
import android.os.Build
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class ConcertBackgroundUploadModule : Module() {
  private val activeCalls = ConcurrentHashMap<String, Call>()
  private val client = OkHttpClient.Builder()
    .connectTimeout(60, TimeUnit.SECONDS)
    .readTimeout(5, TimeUnit.MINUTES)
    .writeTimeout(5, TimeUnit.MINUTES)
    .build()

  override fun definition() = ModuleDefinition {
    Name("ConcertBackgroundUpload")

    AsyncFunction("requestNotificationPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Permissions.askForPermissionsWithPermissionsManager(
          appContext.permissions,
          promise,
          Manifest.permission.POST_NOTIFICATIONS,
        )
      } else {
        promise.resolve(mapOf("status" to "granted", "granted" to true))
      }
    }

    AsyncFunction("startForegroundService") { totalItems: Int, label: String ->
      UploadForegroundService.start(requireContext(), totalItems, label)
    }

    AsyncFunction("updateForegroundService") { totalItems: Int, label: String, progress: Double ->
      UploadForegroundService.update(requireContext(), totalItems, label, progress)
    }

    AsyncFunction("stopForegroundService") {
      UploadForegroundService.stop(requireContext())
    }

    AsyncFunction("cancelUpload") { queueId: String ->
      activeCalls.remove(queueId)?.cancel()
    }

    AsyncFunction("sha256File") Coroutine { fileUri: String ->
      withContext(Dispatchers.IO) {
        val file = fileForUri(fileUri)
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
          val buffer = ByteArray(1024 * 1024)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
          }
        }
        digest.digest().joinToString("") { "%02x".format(it) }
      }
    }

    AsyncFunction("uploadPart") Coroutine { options: UploadPartOptions ->
      withContext(Dispatchers.IO) {
        var lastNotificationAt = 0L
        val partLength = options.byteEnd - options.byteStart
        val requestBody = FileRangeRequestBody(
          options.fileUri,
          options.byteStart,
          options.byteEnd,
          options.contentType.toMediaTypeOrNull(),
        ) { partBytesSent ->
          val now = System.currentTimeMillis()
          if (now - lastNotificationAt >= NOTIFICATION_THROTTLE_MS || partBytesSent == partLength) {
            lastNotificationAt = now
            val overallProgress = (options.byteStart + partBytesSent).toDouble() / options.totalBytes.toDouble()
            UploadForegroundService.update(requireContext(), options.remainingItems, options.label, overallProgress)
          }
        }
        val requestBuilder = Request.Builder().url(options.url).put(requestBody)
        options.headers.forEach { (name, value) -> requestBuilder.header(name, value) }
        val call = client.newCall(requestBuilder.build())
        activeCalls[options.queueId] = call
        try {
          call.execute().use { response ->
            UploadPartResult().apply {
              status = response.code
              body = response.body?.string().orEmpty()
            }
          }
        } finally {
          activeCalls.remove(options.queueId, call)
        }
      }
    }
  }

  private fun requireContext() = appContext.reactContext
    ?: throw IllegalStateException("React context is unavailable")

  private fun fileForUri(fileUri: String): File {
    val uri = Uri.parse(fileUri)
    if (uri.scheme != "file" || uri.path.isNullOrBlank()) {
      throw IllegalArgumentException("Background upload requires an app-owned file URI")
    }
    return File(uri.path!!)
  }

  private companion object {
    const val NOTIFICATION_THROTTLE_MS = 1_000L
  }
}
