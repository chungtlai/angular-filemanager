package com.monosand.drinkout.web.servlet;

import io.minio.BucketExistsArgs;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.Directive;
import io.minio.GetObjectArgs;
import io.minio.ListObjectsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.Item;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import net.minidev.json.JSONArray;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Jakarta EE 10 / JDK 17 FileManager Servlet backed by MinIO (S3-compatible Object Storage).
 * Exposes the exact same single-endpoint API contract as {@link AngularFileManagerServlet}.
 */
@MultipartConfig(
    fileSizeThreshold = 1024 * 1024,      // 1 MB
    maxFileSize = 1024L * 1024 * 200,     // 200 MB
    maxRequestSize = 1024L * 1024 * 500   // 500 MB
)
public class MinioFileManagerServlet extends HttpServlet {

    private static final Logger LOG = LoggerFactory.getLogger(MinioFileManagerServlet.class);
    private static final long serialVersionUID = 2948102948102948102L;

    enum Mode {
        list, rename, move, copy, remove, edit, getContent, createFolder, changePermissions, compress, extract, upload
    }

    private Map<Mode, Boolean> enabledAction = null;
    private String dateFormat = "yyyy-MM-dd HH:mm:ss";

    private String endpoint = "http://localhost:9000";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private String bucket = "filemanager";
    private String basePrefix = "";

    private MinioClient minioClient;
    private volatile boolean bucketVerified = false;

    public MinioFileManagerServlet() {
    }

    // Package-private constructor/setter for unit testing with mock MinioClient
    MinioFileManagerServlet(MinioClient minioClient) {
        this.minioClient = minioClient;
        this.bucketVerified = true;
    }

    void setMinioClient(MinioClient minioClient) {
        this.minioClient = minioClient;
        this.bucketVerified = true;
    }

    private String resolveParam(String paramName, String envName, String defaultValue) {
        String sysVal = System.getProperty(paramName);
        if (sysVal != null && !sysVal.isBlank()) {
            return sysVal.trim();
        }
        String envVal = System.getenv(envName);
        if (envVal != null && !envVal.isBlank()) {
            return envVal.trim();
        }
        String initVal = getInitParameter(paramName);
        if (initVal != null && !initVal.isBlank()) {
            return initVal.trim();
        }
        return defaultValue;
    }

    @Override
    public void init() throws ServletException {
        super.init();

        this.endpoint = resolveParam("minio.endpoint", "MINIO_ENDPOINT", "http://localhost:9000");
        this.accessKey = resolveParam("minio.accessKey", "MINIO_ACCESS_KEY", "minioadmin");
        this.secretKey = resolveParam("minio.secretKey", "MINIO_SECRET_KEY", "minioadmin");
        this.bucket = resolveParam("minio.bucket", "MINIO_BUCKET", "filemanager");
        this.basePrefix = normalizePrefix(resolveParam("minio.base.prefix", "MINIO_BASE_PREFIX", ""));

        String configDateFormat = getInitParameter("date.format");
        if (configDateFormat != null && !configDateFormat.isBlank()) {
            try {
                String normalizedFormat = configDateFormat.trim().replace("hh:mm:ss", "HH:mm:ss");
                new SimpleDateFormat(normalizedFormat).format(new Date());
                this.dateFormat = normalizedFormat;
            } catch (IllegalArgumentException e) {
                throw new ServletException("invalid date.format", e);
            }
        }

        String enabledActionsParam = getInitParameter("enabled.action");
        if (enabledActionsParam == null) {
            enabledAction = Collections.emptyMap();
        } else {
            final String enabledActions = enabledActionsParam.toLowerCase();
            Pattern movePattern = Pattern.compile("\\bmove\\b");
            enabledAction = new EnumMap<>(Mode.class);
            enabledAction.put(Mode.rename, enabledActions.contains("rename"));
            enabledAction.put(Mode.move, movePattern.matcher(enabledActions).find());
            enabledAction.put(Mode.remove, enabledActions.contains("remove"));
            enabledAction.put(Mode.edit, enabledActions.contains("edit"));
            enabledAction.put(Mode.createFolder, enabledActions.contains("createfolder"));
            enabledAction.put(Mode.changePermissions, enabledActions.contains("changepermissions"));
            enabledAction.put(Mode.compress, enabledActions.contains("compress"));
            enabledAction.put(Mode.extract, enabledActions.contains("extract"));
            enabledAction.put(Mode.copy, enabledActions.contains("copy"));
            enabledAction.put(Mode.upload, enabledActions.contains("upload"));
        }

        if (this.minioClient == null) {
            this.minioClient = MinioClient.builder()
                    .endpoint(this.endpoint)
                    .credentials(this.accessKey, this.secretKey)
                    .build();
        }
        LOG.info("Initialized MinioFileManagerServlet (endpoint={}, bucket={}, basePrefix='{}')",
                this.endpoint, this.bucket, this.basePrefix);
    }

    private String normalizePrefix(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String cleaned = raw.trim().replace('\\', '/');
        while (cleaned.startsWith("/")) {
            cleaned = cleaned.substring(1);
        }
        while (cleaned.endsWith("/")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        return cleaned.isEmpty() ? "" : cleaned + "/";
    }

    /**
     * Resolves a user-supplied path into a safe S3/MinIO object key, rejecting '..' traversal.
     */
    String resolveSafeKey(String userPath, boolean asFolderPrefix) throws IOException {
        String raw = userPath == null ? "" : userPath.trim().replace('\\', '/');
        while (raw.startsWith("/")) {
            raw = raw.substring(1);
        }
        while (raw.endsWith("/")) {
            raw = raw.substring(0, raw.length() - 1);
        }

        if (!raw.isEmpty()) {
            String[] segments = raw.split("/");
            List<String> cleanSegments = new ArrayList<>();
            for (String seg : segments) {
                if (seg.isEmpty() || ".".equals(seg)) {
                    continue;
                }
                if ("..".equals(seg)) {
                    throw new IOException("Access denied: path outside repository base (" + userPath + ")");
                }
                cleanSegments.add(seg);
            }
            raw = String.join("/", cleanSegments);
        }

        String fullKey = this.basePrefix + raw;
        if (asFolderPrefix && !fullKey.isEmpty() && !fullKey.endsWith("/")) {
            fullKey += "/";
        }
        return fullKey;
    }

    private void ensureBucket() throws Exception {
        if (this.bucketVerified) {
            return;
        }
        synchronized (this) {
            if (!this.bucketVerified) {
                boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(this.bucket).build());
                if (!exists) {
                    minioClient.makeBucket(MakeBucketArgs.builder().bucket(this.bucket).build());
                }
                this.bucketVerified = true;
            }
        }
    }

    private String encodeContentDispositionFilename(String filename) {
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return "inline; filename=\"" + filename.replace("\"", "_") + "\"; filename*=UTF-8''" + encoded;
    }

    private String extractFileName(String key) {
        String clean = key.endsWith("/") ? key.substring(0, key.length() - 1) : key;
        int idx = clean.lastIndexOf('/');
        return idx >= 0 ? clean.substring(idx + 1) : clean;
    }

    @Override
    public void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String action = request.getParameter("action");
        try {
            ensureBucket();
            if ("download".equals(action)) {
                String pathParam = request.getParameter("path");
                String key = resolveSafeKey(pathParam, false);
                StatObjectResponse stat;
                try {
                    stat = minioClient.statObject(StatObjectArgs.builder().bucket(this.bucket).object(key).build());
                } catch (ErrorResponseException e) {
                    response.sendError(HttpServletResponse.SC_NOT_FOUND, "Resource Not Found");
                    return;
                }

                String fileName = extractFileName(key);
                String contentType = stat.contentType();
                if (contentType == null || !"true".equalsIgnoreCase(request.getParameter("preview"))) {
                    contentType = "application/force-download";
                }
                response.setHeader("Content-Type", contentType);
                response.setHeader("Content-Disposition", encodeContentDispositionFilename(fileName));
                if (stat.size() >= 0) {
                    response.setContentLengthLong(stat.size());
                }

                try (InputStream is = minioClient.getObject(GetObjectArgs.builder().bucket(this.bucket).object(key).build())) {
                    is.transferTo(response.getOutputStream());
                    response.getOutputStream().flush();
                }
            } else if ("downloadMultiple".equals(action)) {
                String toFilename = request.getParameter("toFilename");
                if (toFilename == null || toFilename.isBlank()) {
                    toFilename = "angular-filemanager.zip";
                }
                String[] items = request.getParameterValues("items[]");
                if (items == null) {
                    items = request.getParameterValues("items");
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                if (items != null) {
                    try (ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(baos))) {
                        for (String item : items) {
                            String key = resolveSafeKey(item, false);
                            String fileName = extractFileName(key);
                            try (InputStream is = minioClient.getObject(
                                    GetObjectArgs.builder().bucket(this.bucket).object(key).build())) {
                                zos.putNextEntry(new ZipEntry(fileName));
                                is.transferTo(zos);
                                zos.closeEntry();
                            } catch (Exception ex) {
                                LOG.warn("Skipping missing object in downloadMultiple: {}", key);
                            }
                        }
                    }
                }
                byte[] zipBytes = baos.toByteArray();
                response.setContentType("application/zip");
                response.setHeader("Content-Disposition", encodeContentDispositionFilename(toFilename));
                response.setContentLength(zipBytes.length);
                response.getOutputStream().write(zipBytes);
                response.getOutputStream().flush();
            } else {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Unknown or missing action parameter");
            }
        } catch (Exception ex) {
            LOG.error("MinIO GET error", ex);
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "MinIO Error: " + ex.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        try {
            String contentType = request.getContentType();
            if (contentType != null && contentType.toLowerCase().startsWith("multipart/")) {
                if (isSupportFeature(Mode.upload)) {
                    uploadFile(request, response);
                } else {
                    setError(new IllegalAccessError(notSupportFeature(Mode.upload).getAsString("error")), response);
                }
            } else {
                fileOperation(request, response);
            }
        } catch (ServletException | IOException | RuntimeException ex) {
            LOG.error(ex.getMessage(), ex);
            setError(ex, response);
        }
    }

    private boolean isSupportFeature(Mode mode) {
        return Boolean.TRUE.equals(enabledAction.get(mode));
    }

    private JSONObject notSupportFeature(Mode mode) {
        return error("This implementation does not support " + mode + " feature");
    }

    private void setError(Throwable t, HttpServletResponse response) throws IOException {
        try {
            JSONObject responseJsonObject = error(t.getMessage());
            response.setContentType("application/json;charset=UTF-8");
            PrintWriter out = response.getWriter();
            out.print(responseJsonObject);
            out.flush();
        } catch (IOException ex) {
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, ex.getMessage());
        }
    }

    private void uploadFile(HttpServletRequest request, HttpServletResponse response) throws ServletException {
        if (!isSupportFeature(Mode.upload)) {
            throw new ServletException(notSupportFeature(Mode.upload).getAsString("error"));
        }
        try {
            ensureBucket();
            request.setCharacterEncoding("UTF-8");
            String destination = "/";
            Part destPart = request.getPart("destination");
            if (destPart != null) {
                try (InputStream is = destPart.getInputStream()) {
                    destination = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }
            }

            String destPrefix = resolveSafeKey(destination, true);
            Collection<Part> parts = request.getParts();
            int uploadedCount = 0;

            for (Part part : parts) {
                String submittedFileName = part.getSubmittedFileName();
                if (submittedFileName != null && !submittedFileName.isBlank()) {
                    String safeFileName = Paths.get(submittedFileName).getFileName().toString();
                    String objectKey = destPrefix + safeFileName;
                    String partContentType = part.getContentType() != null
                            ? part.getContentType()
                            : "application/octet-stream";

                    try (InputStream is = part.getInputStream()) {
                        minioClient.putObject(
                                PutObjectArgs.builder()
                                        .bucket(this.bucket)
                                        .object(objectKey)
                                        .stream(is, part.getSize(), -1)
                                        .contentType(partContentType)
                                        .build()
                        );
                    }
                    uploadedCount++;
                }
            }

            if (uploadedCount == 0) {
                throw new ServletException("file size = 0");
            }

            JSONObject responseJsonObject = this.success(null);
            response.setContentType("application/json;charset=UTF-8");
            PrintWriter out = response.getWriter();
            out.print(responseJsonObject);
            out.flush();
        } catch (Exception e) {
            LOG.error("MinIO upload error", e);
            throw new ServletException("MinIO upload error (" + this.endpoint + "): " + e.getMessage(), e);
        }
    }

    private void fileOperation(HttpServletRequest request, HttpServletResponse response) throws IOException {
        JSONObject responseJsonObject;
        try {
            request.setCharacterEncoding("UTF-8");
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = request.getReader()) {
                String str;
                while ((str = br.readLine()) != null) {
                    sb.append(str);
                }
            }
            JSONObject params = JSONValue.parse(sb.toString(), JSONObject.class);
            if (params == null || params.getAsString("action") == null) {
                throw new ServletException("Missing JSON payload or action parameter");
            }

            ensureBucket();
            Mode mode = Mode.valueOf(params.getAsString("action"));
            responseJsonObject = switch (mode) {
                case createFolder -> isSupportFeature(mode) ? createFolder(params) : notSupportFeature(mode);
                case changePermissions -> isSupportFeature(mode) ? changePermissions(params) : notSupportFeature(mode);
                case compress -> isSupportFeature(mode) ? compress(params) : notSupportFeature(mode);
                case copy -> isSupportFeature(mode) ? copy(params) : notSupportFeature(mode);
                case remove -> isSupportFeature(mode) ? remove(params) : notSupportFeature(mode);
                case getContent -> getContent(params);
                case edit -> isSupportFeature(mode) ? editFile(params) : notSupportFeature(mode);
                case extract -> isSupportFeature(mode) ? extract(params) : notSupportFeature(mode);
                case list -> list(params);
                case rename -> isSupportFeature(mode) ? rename(params) : notSupportFeature(mode);
                case move -> isSupportFeature(mode) ? move(params) : notSupportFeature(mode);
                default -> throw new ServletException("not implemented");
            };
        } catch (Exception e) {
            LOG.error("MinIO fileOperation error", e);
            responseJsonObject = error("MinIO Error (" + this.endpoint + "): " + e.getMessage());
        }
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();
        out.print(responseJsonObject);
        out.flush();
    }

    private JSONObject list(JSONObject params) {
        try {
            boolean onlyFolders = "true".equalsIgnoreCase(params.getAsString("onlyFolders"));
            String path = params.getAsString("path");
            String folderPrefix = resolveSafeKey(path, true);

            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(this.bucket)
                            .prefix(folderPrefix)
                            .delimiter("/")
                            .recursive(false)
                            .includeUserMetadata(true)
                            .build()
            );

            SimpleDateFormat dt = new SimpleDateFormat(this.dateFormat);
            List<JSONObject> resultList = new ArrayList<>();

            for (Result<Item> res : results) {
                Item item = res.get();
                String objectName = item.objectName();
                if (objectName.equals(folderPrefix)) {
                    continue;
                }
                boolean isDir = item.isDir() || objectName.endsWith("/");
                if (onlyFolders && !isDir) {
                    continue;
                }

                String relName = objectName.startsWith(folderPrefix)
                        ? objectName.substring(folderPrefix.length())
                        : objectName;
                if (relName.endsWith("/")) {
                    relName = relName.substring(0, relName.length() - 1);
                }
                if (relName.isEmpty()) {
                    continue;
                }

                String rights = isDir ? "drwxr-xr-x" : "-rw-r--r--";
                if (item.userMetadata() != null) {
                    String metaRights = item.userMetadata().getOrDefault(
                            "x-amz-meta-rights",
                            item.userMetadata().get("rights")
                    );
                    if (metaRights != null && !metaRights.isBlank()) {
                        rights = (isDir ? "d" : "-") + (metaRights.length() == 10 ? metaRights.substring(1) : metaRights);
                    }
                }

                Date lastModified = (!isDir && item.lastModified() != null)
                        ? Date.from(item.lastModified().toInstant())
                        : new Date();

                JSONObject el = new JSONObject();
                el.put("name", relName);
                el.put("rights", rights);
                el.put("date", dt.format(lastModified));
                el.put("size", isDir ? 0L : item.size());
                el.put("type", isDir ? "dir" : "file");
                resultList.add(el);
            }

            JSONObject json = new JSONObject();
            json.put("result", resultList);
            return json;
        } catch (Exception e) {
            LOG.error("MinIO list error", e);
            return error("MinIO list error (" + this.endpoint + "): " + e.getMessage());
        }
    }

    private JSONObject createFolder(JSONObject params) {
        try {
            String folderKey = resolveSafeKey(params.getAsString("newPath"), true);
            byte[] empty = new byte[0];
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(this.bucket)
                            .object(folderKey)
                            .stream(new ByteArrayInputStream(empty), 0, -1)
                            .contentType("application/x-directory")
                            .build()
            );
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO createFolder error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject getContent(JSONObject params) {
        try {
            String key = resolveSafeKey(params.getAsString("item"), false);
            try (InputStream is = minioClient.getObject(
                    GetObjectArgs.builder().bucket(this.bucket).object(key).build())) {
                String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                JSONObject json = new JSONObject();
                json.put("result", content);
                return json;
            }
        } catch (Exception e) {
            LOG.error("MinIO getContent error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject editFile(JSONObject params) {
        try {
            String key = resolveSafeKey(params.getAsString("item"), false);
            String content = params.getAsString("content");
            byte[] bytes = (content != null ? content : "").getBytes(StandardCharsets.UTF_8);
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(this.bucket)
                            .object(key)
                            .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                            .contentType("text/plain;charset=UTF-8")
                            .build()
            );
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO editFile error", e);
            return error(e.getMessage());
        }
    }

    private boolean objectExists(String key) {
        try {
            minioClient.statObject(StatObjectArgs.builder().bucket(this.bucket).object(key).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void copyObjectOrPrefix(String srcKey, String destKey) throws Exception {
        if (objectExists(srcKey)) {
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(this.bucket)
                            .object(destKey)
                            .source(CopySource.builder().bucket(this.bucket).object(srcKey).build())
                            .build()
            );
        }
        String srcPrefix = srcKey.endsWith("/") ? srcKey : srcKey + "/";
        String destPrefix = destKey.endsWith("/") ? destKey : destKey + "/";
        Iterable<Result<Item>> children = minioClient.listObjects(
                ListObjectsArgs.builder().bucket(this.bucket).prefix(srcPrefix).recursive(true).build()
        );
        for (Result<Item> res : children) {
            Item item = res.get();
            String childKey = item.objectName();
            String suffix = childKey.substring(srcPrefix.length());
            String targetChildKey = destPrefix + suffix;
            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(this.bucket)
                            .object(targetChildKey)
                            .source(CopySource.builder().bucket(this.bucket).object(childKey).build())
                            .build()
            );
        }
    }

    private void deleteObjectOrPrefix(String targetKey) throws Exception {
        if (objectExists(targetKey)) {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(this.bucket).object(targetKey).build());
        }
        String prefix = targetKey.endsWith("/") ? targetKey : targetKey + "/";
        Iterable<Result<Item>> children = minioClient.listObjects(
                ListObjectsArgs.builder().bucket(this.bucket).prefix(prefix).recursive(true).build()
        );
        for (Result<Item> res : children) {
            Item item = res.get();
            minioClient.removeObject(
                    RemoveObjectArgs.builder().bucket(this.bucket).object(item.objectName()).build()
            );
        }
    }

    private JSONObject rename(JSONObject params) {
        try {
            String srcKey = resolveSafeKey(params.getAsString("item"), false);
            String destKey = resolveSafeKey(params.getAsString("newItemPath"), false);
            copyObjectOrPrefix(srcKey, destKey);
            deleteObjectOrPrefix(srcKey);
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO rename error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject move(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String newDirPrefix = resolveSafeKey(params.getAsString("newPath"), true);
            for (Object obj : paths) {
                String srcKey = resolveSafeKey(obj.toString(), false);
                String name = extractFileName(srcKey);
                String destKey = newDirPrefix + name;
                copyObjectOrPrefix(srcKey, destKey);
                deleteObjectOrPrefix(srcKey);
            }
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO move error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject copy(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String newDirPrefix = resolveSafeKey(params.getAsString("newPath"), true);
            String singleFilename = params.getAsString("singleFilename");
            for (Object obj : paths) {
                String srcKey = resolveSafeKey(obj.toString(), false);
                String name = (singleFilename != null && !singleFilename.isBlank())
                        ? extractFileName(singleFilename)
                        : extractFileName(srcKey);
                String destKey = newDirPrefix + name;
                copyObjectOrPrefix(srcKey, destKey);
            }
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO copy error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject remove(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            for (Object obj : paths) {
                String targetKey = resolveSafeKey(obj.toString(), false);
                if (targetKey.isEmpty() || targetKey.equals(this.basePrefix)) {
                    return error("Cannot remove root directory");
                }
                deleteObjectOrPrefix(targetKey);
            }
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO remove error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject changePermissions(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String perms = params.getAsString("perms"); // e.g. "rwxr-xr-x"
            boolean recursive = "true".equalsIgnoreCase(params.getAsString("recursive"));
            Map<String, String> headers = new HashMap<>();
            headers.put("x-amz-meta-rights", perms != null ? perms : "rw-r--r--");

            for (Object obj : paths) {
                String key = resolveSafeKey(obj.toString(), false);
                if (objectExists(key)) {
                    minioClient.copyObject(
                            CopyObjectArgs.builder()
                                    .bucket(this.bucket)
                                    .object(key)
                                    .source(CopySource.builder().bucket(this.bucket).object(key).build())
                                    .headers(headers)
                                    .metadataDirective(Directive.REPLACE)
                                    .build()
                    );
                }
                if (recursive) {
                    String prefix = key.endsWith("/") ? key : key + "/";
                    Iterable<Result<Item>> children = minioClient.listObjects(
                            ListObjectsArgs.builder().bucket(this.bucket).prefix(prefix).recursive(true).build()
                    );
                    for (Result<Item> res : children) {
                        String childKey = res.get().objectName();
                        minioClient.copyObject(
                                CopyObjectArgs.builder()
                                        .bucket(this.bucket)
                                        .object(childKey)
                                        .source(CopySource.builder().bucket(this.bucket).object(childKey).build())
                                        .headers(headers)
                                        .metadataDirective(Directive.REPLACE)
                                        .build()
                        );
                    }
                }
            }
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO changePermissions error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject compress(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String destPrefix = resolveSafeKey(params.getAsString("destination"), true);
            String compressedFilename = params.getAsString("compressedFilename");
            if (!compressedFilename.toLowerCase().endsWith(".zip")) {
                compressedFilename += ".zip";
            }
            String zipObjectKey = destPrefix + extractFileName(compressedFilename);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(baos))) {
                for (Object pathObj : paths) {
                    String key = resolveSafeKey(pathObj.toString(), false);
                    String baseName = extractFileName(key);

                    if (objectExists(key)) {
                        try (InputStream is = minioClient.getObject(
                                GetObjectArgs.builder().bucket(this.bucket).object(key).build())) {
                            zos.putNextEntry(new ZipEntry(baseName));
                            is.transferTo(zos);
                            zos.closeEntry();
                        }
                    }

                    String prefix = key.endsWith("/") ? key : key + "/";
                    Iterable<Result<Item>> children = minioClient.listObjects(
                            ListObjectsArgs.builder().bucket(this.bucket).prefix(prefix).recursive(true).build()
                    );
                    for (Result<Item> res : children) {
                        Item item = res.get();
                        String childKey = item.objectName();
                        if (childKey.endsWith("/")) {
                            continue;
                        }
                        String relInside = baseName + "/" + childKey.substring(prefix.length());
                        try (InputStream is = minioClient.getObject(
                                GetObjectArgs.builder().bucket(this.bucket).object(childKey).build())) {
                            zos.putNextEntry(new ZipEntry(relInside));
                            is.transferTo(zos);
                            zos.closeEntry();
                        }
                    }
                }
            }

            byte[] zipBytes = baos.toByteArray();
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(this.bucket)
                            .object(zipObjectKey)
                            .stream(new ByteArrayInputStream(zipBytes), zipBytes.length, -1)
                            .contentType("application/zip")
                            .build()
            );
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO compress error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject extract(JSONObject params) {
        try {
            String destPrefix = resolveSafeKey(params.getAsString("destination"), true);
            String folderName = params.getAsString("folderName");
            String targetPrefix = (folderName == null || folderName.isBlank())
                    ? destPrefix
                    : destPrefix + extractFileName(folderName) + "/";
            String zipKey = resolveSafeKey(params.getAsString("item"), false);

            try (InputStream is = minioClient.getObject(
                    GetObjectArgs.builder().bucket(this.bucket).object(zipKey).build());
                 ZipInputStream zis = new ZipInputStream(is)) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String entryName = entry.getName().replace('\\', '/');
                    if (entryName.contains("..")) {
                        throw new IOException("Zip Slip detected: " + entryName);
                    }
                    while (entryName.startsWith("/")) {
                        entryName = entryName.substring(1);
                    }
                    if (entry.isDirectory() || entryName.endsWith("/")) {
                        String dirKey = targetPrefix + entryName;
                        if (!dirKey.endsWith("/")) dirKey += "/";
                        minioClient.putObject(
                                PutObjectArgs.builder()
                                        .bucket(this.bucket)
                                        .object(dirKey)
                                        .stream(new ByteArrayInputStream(new byte[0]), 0, -1)
                                        .contentType("application/x-directory")
                                        .build()
                        );
                    } else {
                        byte[] data = zis.readAllBytes();
                        minioClient.putObject(
                                PutObjectArgs.builder()
                                        .bucket(this.bucket)
                                        .object(targetPrefix + entryName)
                                        .stream(new ByteArrayInputStream(data), data.length, -1)
                                        .contentType("application/octet-stream")
                                        .build()
                        );
                    }
                    zis.closeEntry();
                }
            }
            return success(params);
        } catch (Exception e) {
            LOG.error("MinIO extract error", e);
            return error(e.getMessage());
        }
    }

    private JSONObject error(String msg) {
        JSONObject result = new JSONObject();
        result.put("success", false);
        result.put("error", msg);
        JSONObject json = new JSONObject();
        json.put("result", result);
        return json;
    }

    private JSONObject success(JSONObject params) {
        JSONObject result = new JSONObject();
        result.put("success", true);
        result.put("error", null);
        JSONObject json = new JSONObject();
        json.put("result", result);
        return json;
    }
}

