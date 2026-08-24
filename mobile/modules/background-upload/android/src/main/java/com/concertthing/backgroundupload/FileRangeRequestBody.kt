package com.concertthing.backgroundupload

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.net.URI

/** Streams a byte range directly from disk to OkHttp; media bytes never enter JavaScript. */
class FileRangeRequestBody(
  fileUri: String,
  private val byteStart: Long,
  private val byteEnd: Long,
  private val mediaType: MediaType?,
  private val onProgress: (Long) -> Unit,
) : RequestBody() {
  private val file = URI.create(fileUri).let { uri ->
    if (uri.scheme != "file" || uri.path.isNullOrBlank()) {
      throw IllegalArgumentException("Background upload requires an app-owned file URI")
    }
    File(uri)
  }

  init {
    require(byteStart >= 0 && byteEnd > byteStart) { "Invalid upload byte range" }
    require(byteEnd <= file.length()) { "Upload byte range exceeds the local file" }
  }

  override fun contentType(): MediaType? = mediaType

  override fun contentLength(): Long = byteEnd - byteStart

  override fun writeTo(sink: BufferedSink) {
    FileInputStream(file).use { input ->
      input.channel.position(byteStart)
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      var remaining = contentLength()
      var sent = 0L
      while (remaining > 0) {
        val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
        if (read < 0) throw IOException("Local media ended before the requested upload range")
        sink.write(buffer, 0, read)
        remaining -= read
        sent += read
        onProgress(sent)
      }
    }
  }

  private companion object {
    const val DEFAULT_BUFFER_SIZE = 256 * 1024
  }
}
