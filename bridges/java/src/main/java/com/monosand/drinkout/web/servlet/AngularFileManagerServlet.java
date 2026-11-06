package com.monosand.drinkout.web.servlet;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import net.minidev.json.JSONArray;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;

import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Jakarta EE 10 / JDK 17 FileManager Servlet serving the single-endpoint API contract.
 */
@MultipartConfig(
    fileSizeThreshold = 1024 * 1024,      // 1 MB
    maxFileSize = 1024L * 1024 * 200,     // 200 MB
    maxRequestSize = 1024L * 1024 * 500   // 500 MB
)
public class AngularFileManagerServlet extends HttpServlet {

    private static final Logger LOG = LoggerFactory.getLogger(AngularFileManagerServlet.class);
    private static final long serialVersionUID = -8453502699403909016L;

    private Map<Mode, Boolean> enabledAction = null;

    enum Mode {
        list, rename, move, copy, remove, edit, getContent, createFolder, changePermissions, compress, extract, upload
    }

    private Path basePath;
    private String dateFormat = "yyyy-MM-dd HH:mm:ss";

    @Override
    public void init() throws ServletException {
        super.init();
        String configPath = getInitParameter("repository.base.path");
        String rawBasePath = (configPath == null || configPath.isBlank() || "/tmp".equals(configPath.trim()))
                ? System.getProperty("java.io.tmpdir")
                : configPath.trim();

        try {
            this.basePath = Paths.get(rawBasePath).toAbsolutePath().normalize();
            Files.createDirectories(this.basePath);
            LOG.info("Initialized AngularFileManagerServlet with basePath: {}", this.basePath);
        } catch (IOException e) {
            throw new ServletException("Failed to initialize repository.base.path: " + rawBasePath, e);
        }

        String configDateFormat = getInitParameter("date.format");
        if (configDateFormat != null && !configDateFormat.isBlank()) {
            try {
                // Convert legacy 12-hour 'hh' to 24-hour 'HH' for frontend compatibility
                String normalizedFormat = configDateFormat.trim().replace("hh:mm:ss", "HH:mm:ss");
                new SimpleDateFormat(normalizedFormat).format(new Date());
                this.dateFormat = normalizedFormat;
            } catch (IllegalArgumentException e) {
                LOG.error("Invalid date.format: {}", configDateFormat, e);
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
    }

    /**
     * Resolves a user-provided relative path safely within basePath, preventing Path Traversal.
     */
    private Path resolveSafePath(String userPath) throws IOException {
        String cleaned = userPath == null ? "" : userPath.trim();
        while (cleaned.startsWith("/") || cleaned.startsWith("\\")) {
            cleaned = cleaned.substring(1);
        }
        Path resolved = cleaned.isEmpty()
                ? this.basePath
                : this.basePath.resolve(cleaned).normalize();
        if (!resolved.startsWith(this.basePath)) {
            throw new IOException("Access denied: path outside repository base (" + userPath + ")");
        }
        return resolved;
    }

    private String encodeContentDispositionFilename(String filename) {
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return "inline; filename=\"" + filename.replace("\"", "_") + "\"; filename*=UTF-8''" + encoded;
    }

    @Override
    public void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String action = request.getParameter("action");
        if ("download".equals(action)) {
            String pathParam = request.getParameter("path");
            Path targetPath = resolveSafePath(pathParam);
            if (!Files.isRegularFile(targetPath)) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND, "Resource Not Found");
                return;
            }
            String contentType = getServletContext().getMimeType(targetPath.getFileName().toString());
            if (contentType == null || !"true".equalsIgnoreCase(request.getParameter("preview"))) {
                contentType = "application/force-download";
            }
            response.setHeader("Content-Type", contentType);
            response.setHeader("Content-Disposition", encodeContentDispositionFilename(targetPath.getFileName().toString()));
            response.setContentLengthLong(Files.size(targetPath));

            try (SeekableByteChannel channel = Files.newByteChannel(targetPath)) {
                byte[] buffer = new byte[256 * 1024];
                ByteBuffer byteBuffer = ByteBuffer.wrap(buffer);
                for (int length; (length = channel.read(byteBuffer)) != -1; ) {
                    response.getOutputStream().write(buffer, 0, length);
                    byteBuffer.clear();
                }
            } catch (IOException ex) {
                LOG.error(ex.getMessage(), ex);
                throw ex;
            } finally {
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
                        Path path = resolveSafePath(item);
                        if (Files.isRegularFile(path)) {
                            ZipEntry zipEntry = new ZipEntry(path.getFileName().toString());
                            zos.putNextEntry(zipEntry);
                            try (BufferedInputStream bis = new BufferedInputStream(Files.newInputStream(path))) {
                                bis.transferTo(zos);
                            } finally {
                                zos.closeEntry();
                            }
                        }
                    }
                }
            }
            byte[] zipBytes = baos.toByteArray();
            response.setContentType("application/zip");
            response.setHeader("Content-Disposition", encodeContentDispositionFilename(toFilename));
            response.setContentLength(zipBytes.length);
            BufferedOutputStream output = new BufferedOutputStream(response.getOutputStream());
            output.write(zipBytes);
            output.flush();
        } else {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Unknown or missing action parameter");
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
        LOG.debug("check support {}", mode);
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
        LOG.debug("upload now");
        try {
            request.setCharacterEncoding("UTF-8");
            String destination = "/";
            Part destPart = request.getPart("destination");
            if (destPart != null) {
                try (InputStream is = destPart.getInputStream()) {
                    destination = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }
            }

            Path destDir = resolveSafePath(destination);
            Files.createDirectories(destDir);

            Collection<Part> parts = request.getParts();
            int uploadedCount = 0;
            for (Part part : parts) {
                String submittedFileName = part.getSubmittedFileName();
                if (submittedFileName != null && !submittedFileName.isBlank()) {
                    String safeFileName = Paths.get(submittedFileName).getFileName().toString();
                    Path targetFile = destDir.resolve(safeFileName).normalize();
                    if (!targetFile.startsWith(this.basePath)) {
                        throw new SecurityException("Invalid upload filename: " + submittedFileName);
                    }
                    try (InputStream is = part.getInputStream()) {
                        if (!write(is, targetFile)) {
                            throw new IOException("write error for " + safeFileName);
                        }
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
        } catch (IOException e) {
            LOG.error("Cannot parse multipart request or write file", e);
            throw new ServletException("Cannot upload file: " + e.getMessage(), e);
        }
    }

    private boolean write(InputStream inputStream, Path path) {
        try {
            Files.copy(inputStream, path, StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (IOException ex) {
            LOG.error(ex.getMessage(), ex);
            return false;
        }
    }

    private void fileOperation(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        JSONObject responseJsonObject = null;
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
            if (responseJsonObject == null) {
                responseJsonObject = error("generic error : responseJsonObject is null");
            }
        } catch (Exception e) {
            LOG.error("fileOperation error", e);
            responseJsonObject = error(e.getMessage());
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
            Path dirPath = resolveSafePath(path);
            LOG.debug("list path: {}, onlyFolders: {}", dirPath, onlyFolders);

            List<JSONObject> resultList = new ArrayList<>();
            if (Files.isDirectory(dirPath)) {
                try (DirectoryStream<Path> directoryStream = Files.newDirectoryStream(dirPath)) {
                    SimpleDateFormat dt = new SimpleDateFormat(this.dateFormat);
                    for (Path pathObj : directoryStream) {
                        BasicFileAttributes attrs = Files.readAttributes(pathObj, BasicFileAttributes.class);
                        if (onlyFolders && !attrs.isDirectory()) {
                            continue;
                        }
                        JSONObject el = new JSONObject();
                        el.put("name", pathObj.getFileName().toString());
                        el.put("rights", getPermissions(pathObj));
                        el.put("date", dt.format(new Date(attrs.lastModifiedTime().toMillis())));
                        el.put("size", attrs.size());
                        el.put("type", attrs.isDirectory() ? "dir" : "file");
                        resultList.add(el);
                    }
                }
            }
            JSONObject json = new JSONObject();
            json.put("result", resultList);
            return json;
        } catch (Exception e) {
            LOG.error("list:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject move(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            Path newpath = resolveSafePath(params.getAsString("newPath"));
            for (Object obj : paths) {
                Path path = resolveSafePath(obj.toString());
                Path mpath = newpath.resolve(path.getFileName()).normalize();
                if (!mpath.startsWith(this.basePath)) {
                    return error("Invalid target path");
                }
                if (Files.exists(mpath)) {
                    return error(mpath.getFileName() + " already exists!");
                }
            }
            for (Object obj : paths) {
                Path path = resolveSafePath(obj.toString());
                Path mpath = newpath.resolve(path.getFileName()).normalize();
                Files.move(path, mpath, StandardCopyOption.REPLACE_EXISTING);
            }
            return success(params);
        } catch (IOException e) {
            LOG.error("move:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject rename(JSONObject params) {
        try {
            String path = params.getAsString("item");
            String newpath = params.getAsString("newItemPath");
            LOG.debug("rename from: {} to: {}", path, newpath);

            File srcFile = resolveSafePath(path).toFile();
            File destFile = resolveSafePath(newpath).toFile();
            if (srcFile.isFile()) {
                FileUtils.moveFile(srcFile, destFile);
            } else {
                FileUtils.moveDirectory(srcFile, destFile);
            }
            return success(params);
        } catch (IOException e) {
            LOG.error("rename:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject copy(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            Path newpath = resolveSafePath(params.getAsString("newPath"));
            String newFileName = params.getAsString("singleFilename");
            for (Object obj : paths) {
                Path srcPath = resolveSafePath(obj.toString());
                Path fileName = (newFileName == null || newFileName.isBlank())
                        ? srcPath.getFileName()
                        : Paths.get(newFileName).getFileName();
                Path mpath = newpath.resolve(fileName).normalize();
                if (Files.exists(mpath)) {
                    return error(mpath.getFileName() + " already exists!");
                }
            }
            for (Object obj : paths) {
                Path srcPath = resolveSafePath(obj.toString());
                Path fileName = (newFileName == null || newFileName.isBlank())
                        ? srcPath.getFileName()
                        : Paths.get(newFileName).getFileName();
                Path mpath = newpath.resolve(fileName).normalize();
                if (Files.isDirectory(srcPath)) {
                    FileUtils.copyDirectory(srcPath.toFile(), mpath.toFile());
                } else {
                    Files.copy(srcPath, mpath, StandardCopyOption.REPLACE_EXISTING);
                }
            }
            return success(params);
        } catch (IOException e) {
            LOG.error("copy:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject remove(JSONObject params) throws ServletException {
        JSONArray paths = (JSONArray) params.get("items");
        StringBuilder error = new StringBuilder();
        StringBuilder success = new StringBuilder();
        for (Object obj : paths) {
            try {
                Path path = resolveSafePath(obj.toString());
                if (path.equals(this.basePath)) {
                    error.append("Cannot remove root directory");
                    continue;
                }
                if (!FileUtils.deleteQuietly(path.toFile())) {
                    error.append(error.length() > 0 ? "\n" : "Can't remove: \n/")
                            .append(this.basePath.relativize(path));
                } else {
                    success.append(error.length() > 0 ? "\n" : "\nBut removed: \n/")
                            .append(this.basePath.relativize(path));
                    LOG.debug("remove {}", path);
                }
            } catch (IOException e) {
                error.append(e.getMessage());
            }
        }
        if (error.length() > 0) {
            if (success.length() > 0) {
                success.append("\nPlease refresh this folder to list last result.");
            }
            throw new ServletException(error.toString() + success.toString());
        } else {
            return success(params);
        }
    }

    private JSONObject getContent(JSONObject params) {
        try {
            Path filePath = resolveSafePath(params.getAsString("item"));
            JSONObject json = new JSONObject();
            json.put("result", Files.readString(filePath, StandardCharsets.UTF_8));
            return json;
        } catch (IOException ex) {
            LOG.error("getContent:" + ex.getMessage(), ex);
            return error(ex.getMessage());
        }
    }

    private JSONObject editFile(JSONObject params) {
        try {
            String path = params.getAsString("item");
            LOG.debug("editFile path: {}", path);
            Path srcPath = resolveSafePath(path);
            String content = params.getAsString("content");
            Files.writeString(srcPath, content != null ? content : "", StandardCharsets.UTF_8);
            return success(params);
        } catch (IOException e) {
            LOG.error("editFile:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject createFolder(JSONObject params) {
        try {
            Path path = resolveSafePath(params.getAsString("newPath"));
            LOG.debug("createFolder path: {}", path);
            Files.createDirectories(path);
            return success(params);
        } catch (FileAlreadyExistsException ex) {
            return success(params);
        } catch (IOException e) {
            LOG.error("createFolder:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject changePermissions(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String perms = params.getAsString("perms");         // e.g. "rw-r-x-wx"
            String permsCode = params.getAsString("permsCode"); // e.g. "653"
            boolean recursive = "true".equalsIgnoreCase(params.getAsString("recursive"));
            for (Object path : paths) {
                LOG.debug("changepermissions path: {} perms: {} permsCode: {} recursive: {}", path, perms, permsCode, recursive);
                File f = resolveSafePath(path.toString()).toFile();
                setPermissions(f, perms, recursive);
            }
            return success(params);
        } catch (IOException e) {
            LOG.error("changepermissions:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    private JSONObject compress(JSONObject params) {
        try {
            JSONArray paths = (JSONArray) params.get("items");
            String paramDest = params.getAsString("destination");
            final Path dest = resolveSafePath(paramDest);
            String compressedFilename = params.getAsString("compressedFilename");
            if (!compressedFilename.toLowerCase().endsWith(".zip")) {
                compressedFilename += ".zip";
            }
            Path zip = dest.resolve(Paths.get(compressedFilename).getFileName()).normalize();
            if (Files.exists(zip)) {
                return error(zip.getFileName() + " already exists!");
            }
            Map<String, String> env = new HashMap<>();
            env.put("create", "true");
            boolean zipped = false;
            URI zipUri = URI.create("jar:" + zip.toUri());
            try (FileSystem zipfs = FileSystems.newFileSystem(zipUri, env)) {
                for (Object path : paths) {
                    Path realPath = resolveSafePath(path.toString());
                    Path baseParent = realPath.getParent() != null ? realPath.getParent() : this.basePath;
                    if (Files.isDirectory(realPath)) {
                        Files.walkFileTree(realPath, new SimpleFileVisitor<Path>() {
                            @Override
                            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                                String rel = baseParent.relativize(dir).toString().replace('\\', '/');
                                Files.createDirectories(zipfs.getPath("/" + rel));
                                return FileVisitResult.CONTINUE;
                            }

                            @Override
                            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                                String rel = baseParent.relativize(file).toString().replace('\\', '/');
                                Path pathInZipFile = zipfs.getPath("/" + rel);
                                Files.copy(file, pathInZipFile, StandardCopyOption.REPLACE_EXISTING);
                                return FileVisitResult.CONTINUE;
                            }
                        });
                    } else if (Files.isRegularFile(realPath)) {
                        Path pathInZipFile = zipfs.getPath("/" + realPath.getFileName().toString());
                        Files.copy(realPath, pathInZipFile, StandardCopyOption.REPLACE_EXISTING);
                    }
                }
                zipped = true;
            } finally {
                if (!zipped) {
                    Files.deleteIfExists(zip);
                }
            }
            return success(params);
        } catch (IOException e) {
            LOG.error("compress:" + e.getMessage(), e);
            return error(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private JSONObject extract(JSONObject params) {
        boolean genFolder = false;
        Path folder = null;
        try {
            Path dest = resolveSafePath(params.getAsString("destination"));
            String folderName = params.getAsString("folderName");
            folder = (folderName == null || folderName.isBlank())
                    ? dest
                    : dest.resolve(Paths.get(folderName).getFileName()).normalize();
            if (!folder.startsWith(this.basePath)) {
                return error("Invalid extraction folder");
            }
            if (!Files.isDirectory(folder)) {
                genFolder = true;
                Files.createDirectories(folder);
            }
            Path zipPath = resolveSafePath(params.getAsString("item"));
            Map<String, String> env = new HashMap<>();
            env.put("create", "false");
            final Path targetRoot = folder;
            URI zipUri = URI.create("jar:" + zipPath.toUri());
            try (FileSystem zipfs = FileSystems.newFileSystem(zipUri, env)) {
                Files.walkFileTree(zipfs.getPath("/"), new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                        if (file.getNameCount() > 0) {
                            String rel = file.subpath(0, file.getNameCount()).toString();
                            Path destFile = targetRoot.resolve(rel).normalize();
                            // Zip Slip check
                            if (!destFile.startsWith(targetRoot)) {
                                throw new IOException("Zip Slip detected: " + rel);
                            }
                            if (destFile.getParent() != null) {
                                Files.createDirectories(destFile.getParent());
                            }
                            Files.copy(file, destFile, StandardCopyOption.REPLACE_EXISTING);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                        if (dir.getNameCount() > 0) {
                            String rel = dir.subpath(0, dir.getNameCount()).toString();
                            Path subFolder = targetRoot.resolve(rel).normalize();
                            if (!subFolder.startsWith(targetRoot)) {
                                throw new IOException("Zip Slip detected: " + rel);
                            }
                            Files.createDirectories(subFolder);
                        }
                        return FileVisitResult.CONTINUE;
                    }
                });
            }
            return success(params);
        } catch (IOException e) {
            if (genFolder && folder != null) {
                FileUtils.deleteQuietly(folder.toFile());
            }
            LOG.error("extract:" + e.getMessage(), e);
            return error(e.getMessage());
        }
    }

    /**
     * Cross-platform permissions reader: uses PosixFileAttributeView on Linux/macOS,
     * and falls back to File canRead/canWrite/canExecute on Windows NTFS.
     */
    private String getPermissions(Path path) throws IOException {
        PosixFileAttributeView view = Files.getFileAttributeView(path, PosixFileAttributeView.class);
        if (view != null) {
            PosixFileAttributes readAttributes = view.readAttributes();
            Set<PosixFilePermission> permissions = readAttributes.permissions();
            return (Files.isDirectory(path) ? "d" : "-") + PosixFilePermissions.toString(permissions);
        }
        File f = path.toFile();
        String prefix = f.isDirectory() ? "d" : "-";
        String rwx = (f.canRead() ? "r" : "-") + (f.canWrite() ? "w" : "-") + (f.canExecute() ? "x" : "-");
        return prefix + rwx + rwx + rwx;
    }

    /**
     * Cross-platform permissions writer: uses PosixFileAttributeView when supported,
     * and falls back to java.io.File setReadable/setWritable/setExecutable on Windows.
     */
    private String setPermissions(File file, String permsCode, boolean recursive) throws IOException {
        String normalized = permsCode != null && permsCode.length() == 10 ? permsCode.substring(1) : permsCode;
        PosixFileAttributeView view = Files.getFileAttributeView(file.toPath(), PosixFileAttributeView.class);
        if (view != null && normalized != null && normalized.length() == 9) {
            view.setPermissions(PosixFilePermissions.fromString(normalized));
        } else if (normalized != null && normalized.length() >= 3) {
            file.setReadable(normalized.charAt(0) == 'r', false);
            file.setWritable(normalized.charAt(1) == 'w', false);
            file.setExecutable(normalized.charAt(2) == 'x', false);
        }
        if (file.isDirectory() && recursive) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    setPermissions(child, permsCode, true);
                }
            }
        }
        return permsCode;
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

