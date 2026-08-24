package com.concertthing.backgroundupload

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class UploadPartOptions : Record {
  @Field lateinit var queueId: String
  @Field lateinit var url: String
  @Field lateinit var fileUri: String
  @Field var byteStart: Long = 0
  @Field var byteEnd: Long = 0
  @Field var totalBytes: Long = 0
  @Field lateinit var contentType: String
  @Field var headers: Map<String, String> = emptyMap()
  @Field var label: String = "Uploading media"
  @Field var remainingItems: Int = 1
}

class UploadPartResult : Record {
  @Field var status: Int = 0
  @Field var body: String = ""
}
