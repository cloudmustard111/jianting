package com.jianting.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 练耳与卷帘操作是持续使用场景，亮屏期间不熄屏
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getBridge().getWebView().addJavascriptInterface(new SaveBridge(), "JiantingSave");
    }

    // MIDI 导出的保存出口：web 端走 a[download]，WebView 里 blob 下载不通，
    // 所以 export.js 检测到 window.JiantingSave 时把字节 base64 递过来，这里落盘。
    // API 29+ 直接写系统 Downloads（无需存储权限）；更旧版本写应用私有 Downloads 并提示。
    private class SaveBridge {
        @JavascriptInterface
        public void save(String base64, String filename) {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            try {
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, "audio/midi");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri inserted = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    try (OutputStream os = getContentResolver().openOutputStream(inserted)) {
                        os.write(data);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(inserted, values, null, null);
                    where = "系统 Downloads";
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File out = new File(dir, filename);
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(data);
                    }
                    where = "应用目录 Android/data/" + getPackageName() + "/files/Download";
                }
                final String msg = "已保存 " + filename + " → " + where;
                runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }
    }
}
