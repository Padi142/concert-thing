package com.concertthing.backgroundupload

import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class FileRangeRequestBodyTest {
  @Test
  fun streamsOnlyTheRequestedRangeAndReportsProgress() {
    val file = File.createTempFile("concert-upload-range", ".bin")
    try {
      file.writeBytes(byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7))
      val progress = mutableListOf<Long>()
      val body = FileRangeRequestBody(file.toURI().toString(), 2, 6, null, progress::add)
      val sink = Buffer()

      body.writeTo(sink)

      assertEquals(4L, body.contentLength())
      assertArrayEquals(byteArrayOf(2, 3, 4, 5), sink.readByteArray())
      assertEquals(4L, progress.last())
    } finally {
      file.delete()
    }
  }
}
