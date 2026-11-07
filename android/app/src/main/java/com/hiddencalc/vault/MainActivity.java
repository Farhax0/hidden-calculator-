package com.hiddencalc.vault;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the calculator / vault web app (bundled in assets/www) inside a WebView.
 * Files are encrypted by the web app and stored in the app's private storage (IndexedDB),
 * which other apps — including the Gallery — cannot see.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/www/index.html";

    private static final int REQ_PICK_FILES = 1;
    private static final int REQ_SAVE_FILE = 2;
    private static final int REQ_DELETE_ORIGINALS = 3;

    private WebView webView;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    private ValueCallback<Uri[]> filePathCallback;
    private final List<Uri> lastPicked = new ArrayList<>();

    private File pendingExport;
    private String pendingExportName;

    /** True while we sent the user to a system screen (file picker, save dialog…) — don't lock then. */
    private boolean inSystemDialog = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Hide app content from screenshots, screen recording and the "recent apps" preview.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never navigate away from the bundled app.
                return !request.getUrl().toString().startsWith(ORIGIN);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    inSystemDialog = true;
                    startActivityForResult(i, REQ_PICK_FILES);
                } catch (Exception e) {
                    inSystemDialog = false;
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                // Full-screen video
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                root.removeView(fullscreenView);
                fullscreenView = null;
                webView.setVisibility(View.VISIBLE);
                if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
                fullscreenCallback = null;
            }
        });

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.loadUrl(START_URL);
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onStop() {
        super.onStop();
        if (!inSystemDialog) lockVault();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private void lockVault() {
        if (fullscreenView != null && webView.getWebChromeClient() != null) webView.getWebChromeClient().onHideCustomView();
        webView.evaluateJavascript("window.__lockVault && window.__lockVault()", null);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            webView.getWebChromeClient().onHideCustomView();
            return;
        }
        // Let the web app close the viewer / settings / vault; if it had nothing to close, leave the app.
        webView.evaluateJavascript("window.__onBack ? window.__onBack() : false", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    private void js(String code) {
        runOnUiThread(() -> webView.evaluateJavascript(code, null));
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'";
    }

    // ---------------------------------------------------------------- activity results

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        inSystemDialog = false;

        if (requestCode == REQ_PICK_FILES) {
            Uri[] result = null;
            lastPicked.clear();
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
                if (result != null) for (Uri u : result) lastPicked.add(u);
            }
            if (filePathCallback != null) filePathCallback.onReceiveValue(result);
            filePathCallback = null;

        } else if (requestCode == REQ_SAVE_FILE) {
            File tmp = pendingExport;
            pendingExport = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && tmp != null) {
                try (InputStream in = new FileInputStream(tmp);
                     OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    js("window.__toast && window.__toast(" + jsString("Saved " + pendingExportName) + ")");
                } catch (Exception e) {
                    js("window.__toast && window.__toast('Could not save the file.')");
                }
            }
            if (tmp != null) tmp.delete();

        } else if (requestCode == REQ_DELETE_ORIGINALS) {
            boolean ok = resultCode == RESULT_OK;
            if (ok) lastPicked.clear();
            js("window.__toast && window.__toast(" + jsString(ok ? "Originals deleted from your phone." : "Originals were not deleted.") + ")");
        }
    }

    // ---------------------------------------------------------------- JS bridge

    public class Bridge {

        /** Start an export: the web app streams decrypted bytes into a private temp file. */
        @JavascriptInterface
        public void beginExport(String name) {
            if (pendingExport != null) pendingExport.delete();
            pendingExport = new File(getCacheDir(), "export.tmp");
            pendingExport.delete();
            pendingExportName = name;
        }

        @JavascriptInterface
        public boolean appendExport(String base64) {
            try (FileOutputStream out = new FileOutputStream(pendingExport, true)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Ask the user where to save the exported file. */
        @JavascriptInterface
        public void finishExport(String mime) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, pendingExportName);
                try {
                    inSystemDialog = true;
                    startActivityForResult(i, REQ_SAVE_FILE);
                } catch (Exception e) {
                    inSystemDialog = false;
                    js("window.__toast && window.__toast('Could not open the save dialog.')");
                }
            });
        }

        @JavascriptInterface
        public int pickedCount() {
            return lastPicked.size();
        }

        /** Delete the files that were just imported from their original location (gallery, downloads…). */
        @JavascriptInterface
        public void deleteOriginals() {
            runOnUiThread(MainActivity.this::deleteOriginalsNow);
        }
    }

    private void deleteOriginalsNow() {
        ContentResolver cr = getContentResolver();
        List<Uri> needSystemConfirm = new ArrayList<>();
        int deleted = 0;
        for (Uri uri : new ArrayList<>(lastPicked)) {
            boolean ok = false;
            try {
                ok = DocumentsContract.deleteDocument(cr, uri);
            } catch (Exception ignored) {
            }
            if (ok) {
                deleted++;
                lastPicked.remove(uri);
                continue;
            }
            // Photos/videos belong to the system media store; Android 11+ must ask the user to confirm.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    Uri media = "media".equals(uri.getAuthority()) ? uri : MediaStore.getMediaUri(this, uri);
                    if (media != null) needSystemConfirm.add(media);
                } catch (Exception ignored) {
                }
            }
        }

        if (!needSystemConfirm.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                PendingIntent pi = MediaStore.createDeleteRequest(cr, needSystemConfirm);
                inSystemDialog = true;
                startIntentSenderForResult(pi.getIntentSender(), REQ_DELETE_ORIGINALS, null, 0, 0, 0);
                return;
            } catch (IntentSender.SendIntentException | RuntimeException e) {
                inSystemDialog = false;
            }
        }

        int left = lastPicked.size();
        String msg = left == 0
                ? "Originals deleted from your phone."
                : (deleted > 0 ? deleted + " deleted. " : "") + "Please delete the remaining originals manually in your Gallery/Files app.";
        if (left == 0) lastPicked.clear();
        js("window.__toast && window.__toast(" + jsString(msg) + ", 5000)");
    }
}
