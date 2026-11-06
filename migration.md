# Angular FileManager 遷移技術文件 (`migration.md`)

本文件完整記錄 `angular-filemanager` 從舊版 **AngularJS 1.6 + JavaEE 5/Servlet 2.5** 升級至 **React 18 (TypeScript + Tailwind CSS + shadcn/ui) + JDK 17 (Jakarta EE 10 / Servlet 6.0 WAR)** 的評估、架構拆解、技術選型決策與最終遷移成果。

---

## 1. 遷移前舊版技術棧總覽 (Legacy Tech Stack)

### 1.1 前端技術棧 (AngularJS 1.x 世代)
| 類別 | 技術 / 套件 | 舊版版本 | 用途與說明 |
| :--- | :--- | :--- | :--- |
| **核心框架** | AngularJS | `^1.6.7` | 單一模組 `FileManagerApp`，依賴 `$scope` / `$rootScope` 雙向綁定與 Prototype Service |
| **UI / 樣式** | Bootstrap 3 + Bootswatch (Paper) | `~3.3.2` / `~3.3.7` | Material Design 風格的 Paper 主題、Glyphicons 字型圖示、Bootstrap Modal |
| **DOM / 事件** | jQuery | `~3.1.1` | 操作 Bootstrap Modal (`element.modal()`)、右鍵選單 (`#context-menu`) 座標定位與焦點控制 |
| **多語系 (i18n)** | `angular-translate` | `~2.15.1` | 內建 16 國語言字典 (`src/js/providers/translations.js`) |
| **檔案上傳** | `ng-file-upload` | `^12.0.1` | 處理 `multipart/form-data` 多檔上傳、拖曳上傳 (`ngf-drop`) 與進度條 |
| **檔案下載** | `window.Blob` + `window.saveAs` | 原生 / 外部 | 檢測 `$window.saveAs`，若無則退回 `window.open` |
| **打包工具** | Gulp 3 | `^3.9.1` | 透過 `gulp-angular-templatecache` 將 `src/templates/*.html` 編譯進 `$templateCache`，再合併壓縮至 `dist/` |

### 1.2 後端 Java Bridge 技術棧 (`bridges/java`)
> 舊版 `bridges/java` 僅提供散裝原始碼與設定檔，缺乏 `pom.xml` 或 `build.gradle` 建置檔。

| 類別 | 技術 / 套件 | 舊版版本 / Namespace | 用途與說明 |
| :--- | :--- | :--- | :--- |
| **Web 標準** | Java Servlet API (`web-app_2_5`) | Servlet 2.5 (`javax.servlet.*`) | 單一核心 `AngularFileManagerServlet`，掛載於 `/bridges/php/handler.php` |
| **安全框架** | Spring Security | XML Config (Spring 3/4) | `spring-security.xml`：使用已棄用的 `<password-encoder hash="plaintext"/>` 與硬編碼帳密 |
| **檔案操作** | Java NIO.2 (`java.nio.file.*`) + Commons IO | JDK 7+ / `org.apache.commons.io.FileUtils` | 目錄遍歷 (`DirectoryStream`)、Zip FileSystem (`jar:file:`) 壓縮/解壓縮、POSIX 權限讀寫 (`PosixFileAttributeView`) |
| **上傳解析** | Apache Commons FileUpload | `org.apache.commons.fileupload.*` | `ServletFileUpload` + `DiskFileItemFactory` 解析 `multipart/form-data` |
| **JSON 處理** | `json-smart` (`net.minidev.json`) | `1.x` / `2.x` | `JSONObject`, `JSONArray`, `JSONValue.parse()` |
| **郵件編碼** | JavaMail (`javax.mail.internet.MimeUtility`) | JavaEE 5/6 | 下載檔名 Header 編碼 `MimeUtility.encodeWord()` |
| **HTTP 常數** | Apache HttpComponents (`org.apache.http.HttpStatus`) | `4.x` | 僅用於 `HttpStatus.SC_INTERNAL_SERVER_ERROR` |
| **日誌系統** | SLF4J + Log4j 2 | `org.slf4j.*` + `log4j2.xml` | Console 與 `${sys:catalina.base}/logs/` 滾動日誌 |

---

## 2. 舊版架構拆解與潛在缺陷分析 (Legacy Architecture & Issues Found)

### 2.1 舊版模組職責拆解
* **狀態與控制器 (`src/js/controllers/`)**：
  * `FileManagerCtrl` (`main.js`)：管理選取狀態 (`temps` 多選陣列、`temp` 單選物件，支援 `Shift` 連續選取與 `Ctrl/Meta` 多選)、排序 (`predicate`/`reverse`)、檢視模式切換 (`main-icons.html` / `main-table.html`)、Modal 開關與各項檔案操作觸發。
  * `ModalFileManagerCtrl` (`selector-controller.js`)：用於 Copy / Move / Extract / Compress 時選擇目標資料夾的子導覽器，透過 `$rootScope.selectedModalPath` 共享路徑。
* **資料模型與實體 (`src/js/entities/` & `src/js/services/`)**：
  * `FileNavigator` (`filenavigator.js`)：維護當前路徑 `currentPath`、當前目錄清單 `fileList`，以及側邊欄目錄樹 `history`（遞迴建立）。
  * `Item` (`item.js`)：封裝檔案/目錄實體，包含 `model` 與編輯暫存 `tempModel`，並藉由 Regex 判斷 `isEditable()`、`isImage()`、`isExtractable()`。
  * `Chmod` (`chmod.js`)：處理 `rwxr-xr-x` 字串、八進位 (`755`) 與 `{owner, group, others}` 權限矩陣的雙向轉換。
* **單一 Endpoint 通訊合約 (`API.md`)**：
  * `GET ?action=download&path=...`：單檔下載與圖片預覽。
  * `GET ?action=downloadMultiple&items[]=...&toFilename=...`：多檔打包 ZIP 下載。
  * `POST (multipart/form-data)`：`destination` + `file-0`, `file-1`... 多檔上傳。
  * `POST (application/json)`：由 body 內的 `"action"` 欄位分發 11 種指令（`list`, `rename`, `move`, `copy`, `remove`, `edit`, `getContent`, `createFolder`, `changePermissions`, `compress`, `extract`）。

### 2.2 源碼審查發現的嚴重 Bug 與資安漏洞
1. **Windows 環境崩潰 (POSIX 強依賴)**：
   * 舊版 `AngularFileManagerServlet.getPermissions()` 無條件呼叫 `Files.getFileAttributeView(path, PosixFileAttributeView.class).readAttributes()`。在 Windows NTFS 上 `fileAttributeView` 回傳 `null`，導致 `list()` 直接拋出 `NullPointerException`。
2. **路徑穿越漏洞 (Path Traversal) 與 Zip Slip**：
   * 舊版直接使用 `Paths.get(REPOSITORY_BASE_PATH, userPath)`，未做 `.normalize().startsWith(basePath)` 檢查；且在 Windows 下當 `userPath` 以 `/` 開頭時，`Paths.get("C:\\temp", "/sub")` 會被解析至磁碟根目錄 `C:\sub`。
3. **Windows 下 ZIP FileSystem URI 解析失敗**：
   * 舊版 `compress()` 與 `extract()` 使用 `URI.create("jar:file:" + zip.toString())`，在 Windows 路徑含有反斜線 `\` 與磁碟機代號時會拋出 `IllegalArgumentException`。
4. **前後端日期格式不一致**：
   * 前端解析預期 `yyyy-MM-dd HH:mm:ss`（24 小時制），但舊版 Servlet 預設為 `EEE, d MMM yyyy HH:mm:ss z`，且 `web.xml` 誤設為 12 小時制的 `yyyy-MM-dd hh:mm:ss`。
5. **Java 系統屬性拼字錯誤**：
   * `AngularFileManagerServlet.init()` 誤寫為 `System.getProperty("ava.io.tmpdir")`（漏寫 `j`）。
6. **前端多檔 Ajax 下載損毀**：
   * 舊版 `apihandler.js` 的 `downloadMultiple` 組合了帶 query string 的 `url`，卻呼叫 `$http.get(apiUrl)`（未帶參數且未指定 binary responseType），導致下載的 ZIP 檔案損毀。

---

## 3. 遷移目標技術棧建議與架構決策 (Target Stack & Decisions)

### 3.1 技術選型決策表
| 面向 | 評估選項 | 最終決策 | 決策理由 |
| :--- | :--- | :--- | :--- |
| **後端執行環境** | JDK 17 + Jakarta EE 10 (Servlet 6.0) | **純 Jakarta Servlet 6.0 WAR** | 維持輕量單一 Servlet 架構，相容 Tomcat 10.1+ / Jetty 12，不引入龐大的 Spring Boot 依賴 |
| **後端上傳機制** | `commons-fileupload` vs 原生 `@MultipartConfig` | **Jakarta `@MultipartConfig` (`request.getParts()`)** | Servlet 6.0 原生內建 Multipart 解析，徹底移除不相容 `jakarta.*` 的老舊套件 |
| **API 通訊協議** | 單一 Endpoint vs RESTful | **維持原單一 Endpoint (`/bridges/php/handler.php`)** | 100% 向下相容原 `API.md` 合約，降低前後端整合風險 |
| **安全過濾器** | 舊版 Spring Security XML vs 移除/選配 | **移除舊版 XML Filter** | 專注於純 Jakarta Servlet 檔案管理核心，方便直接打包部署與測試 |
| **前端核心與建置** | Vite + React 18 + TypeScript | **Vite 5 + React 18 + TypeScript 5.6** | 極速 HMR 開發體驗、嚴格型別保護與現代化 ESM 打包 |
| **前端 UI 元件庫** | MUI vs Tailwind CSS + shadcn/ui | **Tailwind CSS + shadcn/ui (Radix UI + Lucide Icons)** | 輕量現代、無 Runtime CSS-in-JS 負擔，並透過 Radix UI 原生支援無障礙 Dialog / Dropdown，徹底移除 jQuery |
| **專案目錄結構** | 根目錄前端 + `bridges/java` 後端 vs Monorepo | **根目錄前端 + `bridges/java` Maven WAR** | 保持與原倉庫結構一致，並由 `maven-war-plugin` 自動將根目錄 `dist/` 打包進 WAR |

---

## 4. 前後端遷移成果與檔案對照 (Migration Deliverables)

### 4.1 後端遷移成果 (`bridges/java/`)
* **[pom.xml](file:///d:/study/angular-filemanager/bridges/java/pom.xml)**：
  * 設定 `maven.compiler.release = 17`、`jakarta.servlet:jakarta.servlet-api:6.0.0`。
  * 配置 `maven-war-plugin` 自動將前端建置目錄 `${project.basedir}/../../dist` 打包進 [`angular-filemanager.war`](file:///d:/study/angular-filemanager/bridges/java/target/angular-filemanager.war)。
  * 配置 `jetty-ee10-maven-plugin` (`12.0.10`) 支援 `mvn jetty:run` 本機啟動。
* **[`AngularFileManagerServlet.java`](file:///d:/study/angular-filemanager/bridges/java/src/main/java/com/monosand/drinkout/web/servlet/AngularFileManagerServlet.java)**：
  * 遷移至 `jakarta.servlet.*` 並加上 `@MultipartConfig`。
  * 新增 [`resolveSafePath()`](file:///d:/study/angular-filemanager/bridges/java/src/main/java/com/monosand/drinkout/web/servlet/AngularFileManagerServlet.java#L135-L147) 統一處理路徑正規化與 Path Traversal 防護。
  * 升級 [`getPermissions()`](file:///d:/study/angular-filemanager/bridges/java/src/main/java/com/monosand/drinkout/web/servlet/AngularFileManagerServlet.java#L606-L616) 與 [`setPermissions()`](file:///d:/study/angular-filemanager/bridges/java/src/main/java/com/monosand/drinkout/web/servlet/AngularFileManagerServlet.java#L622-L639)，支援 Linux/macOS (`PosixFileAttributeView`) 與 Windows NTFS (`java.io.File` 讀寫執行權限) 跨平台運作。
  * 改用 `URI.create("jar:" + zip.toUri())` 修正 Windows 下 ZIP 壓縮與解壓縮問題，並加入 Zip Slip 檢查。
  * 改用 `URLEncoder.encode(..., StandardCharsets.UTF_8)` 實作 RFC 5987 下載檔名編碼，移除 `javax.mail` 依賴。
* **[web.xml](file:///d:/study/angular-filemanager/bridges/java/src/main/webapp/WEB-INF/web.xml)**：升級為 Jakarta EE 10 `web-app_6_0.xsd`。
* **[`AngularFileManagerServletTest.java`](file:///d:/study/angular-filemanager/bridges/java/src/test/java/com/monosand/drinkout/web/servlet/AngularFileManagerServletTest.java)**：JUnit 5 + Mockito 自動化測試，涵蓋全檔案操作流程與 Path Traversal 阻擋驗證。

### 4.2 前端遷移成果 (`src/`)
| 舊版 AngularJS 檔案 | 新版 React + TypeScript 檔案 | 遷移說明 |
| :--- | :--- | :--- |
| `src/js/providers/config.js` | [src/config/defaultConfig.ts](file:///d:/study/angular-filemanager/src/config/defaultConfig.ts), [src/types/filemanager.ts](file:///d:/study/angular-filemanager/src/types/filemanager.ts) | 完整型別化的 `FileManagerConfig` 與預設設定 |
| `src/js/entities/chmod.js` | [src/lib/chmod.ts](file:///d:/study/angular-filemanager/src/lib/chmod.ts) | 純函式實作 `createChmod`, `chmodToOctal`, `chmodToCode` |
| `src/js/entities/item.js` | [src/lib/item.ts](file:///d:/study/angular-filemanager/src/lib/item.ts) | 實作 `createFileItem`, `getFullPath`, 檔案型態判定函式 |
| `src/js/filters/filters.js` | [src/lib/utils.ts](file:///d:/study/angular-filemanager/src/lib/utils.ts) | `strLimit`, `fileExtension`, `formatDate`, `humanReadableFileSize`, `cn` |
| `src/js/providers/translations.js` | [src/i18n/translations.ts](file:///d:/study/angular-filemanager/src/i18n/translations.ts), [src/i18n/useTranslation.ts](file:///d:/study/angular-filemanager/src/i18n/useTranslation.ts) | 完整保留 16 國語系字典與參數插值 Hook |
| `src/js/services/apihandler.js`, `apimiddleware.js` | [src/services/api.ts](file:///d:/study/angular-filemanager/src/services/api.ts) | 原生 `fetch` + `XMLHttpRequest`（上傳進度條），修正多檔 ZIP 下載 |
| `src/js/controllers/main.js`, `filenavigator.js` | [src/components/FileManager/FileManager.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/FileManager.tsx) | 整合目錄導覽、側邊欄樹狀結構、多選/範圍選取、拖曳上傳與操作狀態 |
| `src/templates/navbar.html` | [src/components/FileManager/Navbar.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/Navbar.tsx) | 麵包屑導覽、即時搜尋、Icon/Table 檢視切換、16 語系選單 |
| `src/templates/sidebar.html` | [src/components/FileManager/Sidebar.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/Sidebar.tsx) | 遞迴目錄樹導覽元件 |
| `src/templates/main-table.html` | [src/components/FileManager/FileTableView.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/FileTableView.tsx) | 支援欄位排序、多選、雙擊與右鍵選單的表格檢視 |
| `src/templates/main-icons.html` | [src/components/FileManager/FileIconView.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/FileIconView.tsx) | 支援副檔名標籤、多選、雙擊與右鍵選單的格狀圖示檢視 |
| `src/templates/item-context-menu.html` | [src/components/FileManager/FileContextMenu.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/FileContextMenu.tsx) | 智慧判斷單選/多選/資料夾/空白處的浮動右鍵選單 |
| `src/templates/modals.html`, `selector-controller.js` | [src/components/FileManager/Modals.tsx](file:///d:/study/angular-filemanager/src/components/FileManager/Modals.tsx) | 基於 Radix Dialog 的 11 個功能視窗與目標資料夾選擇器 |

---

## 5. 建置、開發與部署指南 (Build, Run & Deploy)

### 5.1 本機前後端分離開發 (Hot Reload)
```powershell
# 1. 啟動後端 Jakarta Servlet (預設監聽 http://localhost:8080)
#    預設檔案根目錄為系統暫存目錄 (java.io.tmpdir)，可於 bridges/java/src/main/webapp/WEB-INF/web.xml 修改 repository.base.path
mvn -f bridges/java/pom.xml jetty:run

# 2. 啟動前端 Vite Dev Server (http://localhost:5173，已內建 /bridges Proxy 至 8080)
npm run dev
```

### 5.2 執行後端自動化測試
```powershell
mvn -f bridges/java/pom.xml test
```

### 5.3 打包單一 `.war` 部署檔 (含前端靜態資源)
```powershell
npm run build
mvn -f bridges/java/pom.xml package
```
建置完成後，將產出 [`bridges/java/target/angular-filemanager.war`](file:///d:/study/angular-filemanager/bridges/java/target/angular-filemanager.war)，可直接部署至 **Apache Tomcat 10.1+** 或 **Eclipse Jetty 12 (EE10)**。

