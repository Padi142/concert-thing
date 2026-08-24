package com.concertthing.backgroundupload

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt

/** Keeps user-initiated uploads alive on Android and makes their state visible. */
class UploadForegroundService : Service() {
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val totalItems = intent?.getIntExtra(EXTRA_TOTAL_ITEMS, 1) ?: 1
    val label = intent?.getStringExtra(EXTRA_LABEL) ?: "Uploading media"
    val progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0
    startForeground(NOTIFICATION_ID, buildNotification(totalItems, label, progress))
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Media uploads", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shows progress while concert photos and videos upload"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(totalItems: Int, label: String, progress: Int): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val countText = if (totalItems == 1) "1 item in upload queue" else "$totalItems items in upload queue"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle(label)
      .setContentText(countText)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setProgress(100, progress.coerceIn(0, 100), false)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "concert_media_uploads"
    private const val NOTIFICATION_ID = 1_424
    private const val ACTION_START = "com.concertthing.backgroundupload.START"
    private const val ACTION_UPDATE = "com.concertthing.backgroundupload.UPDATE"
    private const val EXTRA_TOTAL_ITEMS = "totalItems"
    private const val EXTRA_LABEL = "label"
    private const val EXTRA_PROGRESS = "progress"

    fun start(context: Context, totalItems: Int, label: String) {
      ContextCompat.startForegroundService(context, intent(context, ACTION_START, totalItems, label, 0))
    }

    fun update(context: Context, totalItems: Int, label: String, progress: Double) {
      try {
        context.startService(intent(context, ACTION_UPDATE, totalItems, label, (progress * 100).roundToInt()))
      } catch (_: IllegalStateException) {
        // A periodic worker may run when Android no longer permits starting a service.
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, UploadForegroundService::class.java))
    }

    private fun intent(context: Context, action: String, totalItems: Int, label: String, progress: Int) =
      Intent(context, UploadForegroundService::class.java)
        .setAction(action)
        .putExtra(EXTRA_TOTAL_ITEMS, totalItems.coerceAtLeast(1))
        .putExtra(EXTRA_LABEL, label)
        .putExtra(EXTRA_PROGRESS, progress.coerceIn(0, 100))
  }
}
