package com.monosand.drinkout.web.servlet;

import io.minio.CopyObjectArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.ObjectWriteResponse;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import io.minio.messages.Item;

import jakarta.servlet.ServletConfig;
import jakarta.servlet.ServletContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import net.minidev.json.JSONArray;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;

import okhttp3.Headers;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class MinioFileManagerServletTest {

    private MinioFileManagerServlet servlet;
    private MinioClient minioClient;

    // In-memory S3 bucket store for testing all MinIO operations without an external server
    private final Map<String, byte[]> objectStore = new LinkedHashMap<>();
    private final Map<String, Map<String, String>> metaStore = new HashMap<>();

    @BeforeEach
    void setUp() throws Exception {
        objectStore.clear();
        metaStore.clear();
        minioClient = mock(MinioClient.class);

        // Mock putObject
        when(minioClient.putObject(any(PutObjectArgs.class))).thenAnswer(inv -> {
            PutObjectArgs args = inv.getArgument(0);
            try (InputStream is = args.stream()) {
                objectStore.put(args.object(), is.readAllBytes());
            }
            return mock(ObjectWriteResponse.class);
        });

        // Mock statObject
        when(minioClient.statObject(any(StatObjectArgs.class))).thenAnswer(inv -> {
            StatObjectArgs args = inv.getArgument(0);
            String key = args.object();
            if (!objectStore.containsKey(key)) {
                ErrorResponse errResp = new ErrorResponse("NoSuchKey", "Not found", args.bucket(), key, "1", "1", "1");
                Request req = new Request.Builder().url("http://localhost:9000").build();
                Response httpResp = new Response.Builder().request(req).protocol(Protocol.HTTP_1_1).code(404).message("Not Found").build();
                throw new ErrorResponseException(errResp, httpResp, null);
            }
            StatObjectResponse stat = mock(StatObjectResponse.class);
            when(stat.size()).thenReturn((long) objectStore.get(key).length);
            when(stat.contentType()).thenReturn("application/octet-stream");
            return stat;
        });

        // Mock getObject
        when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(inv -> {
            GetObjectArgs args = inv.getArgument(0);
            byte[] data = objectStore.get(args.object());
            if (data == null) {
                throw new IllegalArgumentException("Object not found: " + args.object());
            }
            return new GetObjectResponse(
                    Headers.of(),
                    args.bucket(),
                    "",
                    args.object(),
                    new ByteArrayInputStream(data)
            );
        });

        // Mock copyObject
        when(minioClient.copyObject(any(CopyObjectArgs.class))).thenAnswer(inv -> {
            CopyObjectArgs args = inv.getArgument(0);
            String srcKey = args.source().object();
            String dstKey = args.object();
            byte[] data = objectStore.get(srcKey);
            if (data != null) {
                objectStore.put(dstKey, data.clone());
                if (args.extraHeaders() != null) {
                    Map<String, String> meta = new HashMap<>();
                    args.extraHeaders().forEach(meta::put);
                    metaStore.put(dstKey, meta);
                }
            }
            return mock(ObjectWriteResponse.class);
        });

        // Mock removeObject
        doAnswer(inv -> {
            RemoveObjectArgs args = inv.getArgument(0);
            objectStore.remove(args.object());
            metaStore.remove(args.object());
            return null;
        }).when(minioClient).removeObject(any(RemoveObjectArgs.class));

        // Mock listObjects
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenAnswer(inv -> {
            ListObjectsArgs args = inv.getArgument(0);
            String prefix = args.prefix() != null ? args.prefix() : "";
            boolean recursive = args.recursive();
            List<Result<Item>> results = new ArrayList<>();
            Set<String> seenDirs = new TreeSet<>();

            for (Map.Entry<String, byte[]> entry : new ArrayList<>(objectStore.entrySet())) {
                String key = entry.getKey();
                if (!key.startsWith(prefix)) continue;

                if (recursive) {
                    Item item = mockItem(key, key.endsWith("/"), entry.getValue().length);
                    results.add(new Result<>(item));
                } else {
                    String rest = key.substring(prefix.length());
                    if (rest.isEmpty()) continue;
                    int slashIdx = rest.indexOf('/');
                    if (slashIdx >= 0 && slashIdx < rest.length() - 1) {
                        // Common prefix directory
                        String dirKey = prefix + rest.substring(0, slashIdx + 1);
                        if (seenDirs.add(dirKey)) {
                            Item dirItem = mockItem(dirKey, true, 0);
                            results.add(new Result<>(dirItem));
                        }
                    } else if (rest.endsWith("/")) {
                        String dirKey = prefix + rest;
                        if (seenDirs.add(dirKey)) {
                            Item dirItem = mockItem(dirKey, true, 0);
                            results.add(new Result<>(dirItem));
                        }
                    } else {
                        Item fileItem = mockItem(key, false, entry.getValue().length);
                        results.add(new Result<>(fileItem));
                    }
                }
            }
            return results;
        });

        servlet = new MinioFileManagerServlet(minioClient);
        ServletConfig config = mock(ServletConfig.class);
        ServletContext context = mock(ServletContext.class);
        when(config.getServletContext()).thenReturn(context);
        when(config.getInitParameter("date.format")).thenReturn("yyyy-MM-dd HH:mm:ss");
        when(config.getInitParameter("enabled.action"))
                .thenReturn("rename,move,remove,edit,createFolder,changePermissions,compress,extract,copy,upload");
        servlet.init(config);
    }

    private Item mockItem(String objectName, boolean isDir, long size) {
        Item item = mock(Item.class);
        when(item.objectName()).thenReturn(objectName);
        when(item.isDir()).thenReturn(isDir);
        when(item.size()).thenReturn(size);
        if (!isDir) {
            when(item.lastModified()).thenReturn(ZonedDateTime.now());
        }
        when(item.userMetadata()).thenReturn(metaStore.getOrDefault(objectName, Map.of()));
        return item;
    }

    private JSONObject postJson(String jsonBody) throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        HttpServletResponse resp = mock(HttpServletResponse.class);
        when(req.getContentType()).thenReturn("application/json");
        when(req.getReader()).thenReturn(new BufferedReader(new StringReader(jsonBody)));

        StringWriter sw = new StringWriter();
        when(resp.getWriter()).thenReturn(new PrintWriter(sw));

        servlet.doPost(req, resp);
        return JSONValue.parse(sw.toString(), JSONObject.class);
    }

    @Test
    void testMinioOperationsEndToEnd() throws Exception {
        // 1. Create folder
        JSONObject createRes = postJson("{\"action\":\"createFolder\",\"newPath\":\"/cloud-docs\"}");
        assertTrue((Boolean) ((JSONObject) createRes.get("result")).get("success"));
        assertTrue(objectStore.containsKey("cloud-docs/"));

        // 2. Edit/Create file
        JSONObject editRes = postJson("{\"action\":\"edit\",\"item\":\"/cloud-docs/readme.md\",\"content\":\"Hello MinIO!\"}");
        assertTrue((Boolean) ((JSONObject) editRes.get("result")).get("success"));

        // 3. Get content
        JSONObject contentRes = postJson("{\"action\":\"getContent\",\"item\":\"/cloud-docs/readme.md\"}");
        assertEquals("Hello MinIO!", contentRes.getAsString("result"));

        // 4. List folder
        JSONObject listRes = postJson("{\"action\":\"list\",\"path\":\"/cloud-docs\"}");
        JSONArray listArr = (JSONArray) listRes.get("result");
        assertEquals(1, listArr.size());
        assertEquals("readme.md", ((JSONObject) listArr.get(0)).getAsString("name"));

        // 5. Copy file
        JSONObject copyRes = postJson("{\"action\":\"copy\",\"items\":[\"/cloud-docs/readme.md\"],\"newPath\":\"/cloud-docs\",\"singleFilename\":\"readme-copy.md\"}");
        assertTrue((Boolean) ((JSONObject) copyRes.get("result")).get("success"));
        assertTrue(objectStore.containsKey("cloud-docs/readme-copy.md"));

        // 6. Compress & Extract on MinIO
        JSONObject compressRes = postJson("{\"action\":\"compress\",\"items\":[\"/cloud-docs\"],\"destination\":\"/\",\"compressedFilename\":\"cloud.zip\"}");
        assertTrue((Boolean) ((JSONObject) compressRes.get("result")).get("success"));
        assertTrue(objectStore.containsKey("cloud.zip"));

        JSONObject extractRes = postJson("{\"action\":\"extract\",\"item\":\"/cloud.zip\",\"destination\":\"/\",\"folderName\":\"unzipped\"}");
        assertTrue((Boolean) ((JSONObject) extractRes.get("result")).get("success"));
        assertTrue(objectStore.containsKey("unzipped/cloud-docs/readme.md"));

        // 7. Path Traversal check
        JSONObject traversalRes = postJson("{\"action\":\"getContent\",\"item\":\"/../../secret.txt\"}");
        JSONObject traversalResultObj = (JSONObject) traversalRes.get("result");
        assertFalse((Boolean) traversalResultObj.get("success"));
        assertTrue(traversalResultObj.getAsString("error").contains("Access denied"));
    }
}
