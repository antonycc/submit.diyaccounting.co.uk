package com.intention.web;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public class Gzip {

    public static byte[] zip(byte[] originalBytes) {
        ByteArrayOutputStream byteOut = new ByteArrayOutputStream();

        try {
            GZIPOutputStream gzipOut = new GZIPOutputStream(byteOut);
            ByteArrayInputStream byteIn = new ByteArrayInputStream(originalBytes);
            byte[] buffer = new byte[1024];
            int len;
            while ((len = byteIn.read(buffer)) != -1) {
                gzipOut.write(buffer, 0, len);
            }

            byteIn.close();
            gzipOut.finish();
            gzipOut.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        return byteOut.toByteArray();
    }

    public static String unzip(ResponseInputStream<GetObjectResponse> is) {
        ByteArrayOutputStream byteOut = new ByteArrayOutputStream();
        byte[] dataBuffer = new byte[1024];
        int bytesRead;

        try {
            GZIPInputStream gis = new GZIPInputStream(is);
            while ((bytesRead = gis.read(dataBuffer)) > 0) {
                byteOut.write(dataBuffer, 0, bytesRead);
            }
            gis.close();
            byteOut.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        return byteOut.toString(StandardCharsets.UTF_8);
    }
}
