package com.monosand.drinkout.web.servlet;

import jakarta.servlet.ServletConfig;
import jakarta.servlet.ServletContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.minidev.json.JSONArray;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.BufferedReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AngularFileManagerServletTest {

    @TempDir
    Path tempDir;

    private AngularFileManagerServlet servlet;

    @BeforeEach
    void setUp() throws Exception {
        servlet = new AngularFileManagerServlet();
        ServletConfig config = mock(ServletConfig.class);
        ServletContext context = mock(ServletContext.class);
        when(config.getServletContext()).thenReturn(context);
        when(config.getInitParameter("repository.base.path")).thenReturn(tempDir.toString());
        when(config.getInitParameter("date.format")).thenReturn("yyyy-MM-dd HH:mm:ss");
        when(config.getInitParameter("enabled.action"))
                .thenReturn("rename,move,remove,edit,createFolder,changePermissions,compress,extract,copy,upload");
        servlet.init(config);
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
    void testEndToEndFileOperationsAndPathTraversalProtection() throws Exception {
        // 1. Create folder
        JSONObject createRes = postJson("{\"action\":\"createFolder\",\"newPath\":\"/docs\"}");
        assertTrue((Boolean) ((JSONObject) createRes.get("result")).get("success"));

        // 2. Create and edit file
        JSONObject editRes = postJson("{\"action\":\"edit\",\"item\":\"/docs/hello.txt\",\"content\":\"Hello JDK 17!\"}");
        assertTrue((Boolean) ((JSONObject) editRes.get("result")).get("success"));

        // 3. Get content
        JSONObject contentRes = postJson("{\"action\":\"getContent\",\"item\":\"/docs/hello.txt\"}");
        assertEquals("Hello JDK 17!", contentRes.getAsString("result"));

        // 4. List folder (verifies Windows POSIX fallback works)
        JSONObject listRes = postJson("{\"action\":\"list\",\"path\":\"/docs\"}");
        JSONArray listArr = (JSONArray) listRes.get("result");
        assertEquals(1, listArr.size());
        JSONObject fileEntry = (JSONObject) listArr.get(0);
        assertEquals("hello.txt", fileEntry.getAsString("name"));
        assertNotNull(fileEntry.getAsString("rights"));

        // 5. Copy file
        JSONObject copyRes = postJson("{\"action\":\"copy\",\"items\":[\"/docs/hello.txt\"],\"newPath\":\"/docs\",\"singleFilename\":\"hello-copy.txt\"}");
        assertTrue((Boolean) ((JSONObject) copyRes.get("result")).get("success"));

        // 6. Compress & Extract
        JSONObject compressRes = postJson("{\"action\":\"compress\",\"items\":[\"/docs\"],\"destination\":\"/\",\"compressedFilename\":\"backup.zip\"}");
        assertTrue((Boolean) ((JSONObject) compressRes.get("result")).get("success"));

        JSONObject extractRes = postJson("{\"action\":\"extract\",\"item\":\"/backup.zip\",\"destination\":\"/\",\"folderName\":\"restored\"}");
        assertTrue((Boolean) ((JSONObject) extractRes.get("result")).get("success"));

        // 7. Path Traversal check
        JSONObject traversalRes = postJson("{\"action\":\"getContent\",\"item\":\"/../../Windows/win.ini\"}");
        JSONObject traversalResultObj = (JSONObject) traversalRes.get("result");
        assertFalse((Boolean) traversalResultObj.get("success"));
        assertTrue(traversalResultObj.getAsString("error").contains("Access denied"));
    }
}

