package com.soranapropertymanagers.app.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;
import com.google.android.gms.tasks.Task;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

@CapacitorPlugin(name = "SmsRetriever")
public class SmsRetrieverPlugin extends Plugin {
    private BroadcastReceiver smsReceiver;

    @PluginMethod
    public void getAppHash(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("hash", computeAppHash(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Android context is unavailable.");
            return;
        }

        Task<Void> task = SmsRetriever.getClient(context).startSmsRetriever();
        task.addOnSuccessListener(unused -> {
            registerReceiver(context);
            call.resolve();
        }).addOnFailureListener(error -> call.reject("Unable to start SMS Retriever.", error));
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        unregisterReceiver();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
    }

    private void registerReceiver(Context context) {
        if (smsReceiver != null) {
            return;
        }

        smsReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context receiverContext, Intent intent) {
                if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) {
                    return;
                }

                Status status = intent.getParcelableExtra(SmsRetriever.EXTRA_STATUS);
                if (status == null) {
                    return;
                }

                switch (status.getStatusCode()) {
                    case CommonStatusCodes.SUCCESS:
                        String message = intent.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE);
                        JSObject payload = new JSObject();
                        payload.put("message", message);
                        payload.put("code", extractOtpCode(message));
                        notifyListeners("smsRetrieved", payload);
                        unregisterReceiver();
                        break;
                    case CommonStatusCodes.TIMEOUT:
                        notifyListeners("smsTimeout", new JSObject());
                        unregisterReceiver();
                        break;
                    default:
                        break;
                }
            }
        };

        IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
        ContextCompat.registerReceiver(context, smsReceiver, filter, ContextCompat.RECEIVER_EXPORTED);
    }

    private void unregisterReceiver() {
        if (smsReceiver == null) {
            return;
        }

        try {
            getContext().unregisterReceiver(smsReceiver);
        } catch (Exception ignored) {
            // Receiver may already be unregistered.
        } finally {
            smsReceiver = null;
        }
    }

    private String extractOtpCode(String message) {
        if (message == null || message.isEmpty()) {
            return "";
        }

        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\b(\\d{6})\\b").matcher(message);
        if (matcher.find()) {
            return matcher.group(1);
        }

        return "";
    }

    private String computeAppHash(Context context) {
        if (context == null) {
            return "";
        }

        try {
            String packageName = context.getPackageName();
            PackageManager pm = context.getPackageManager();
            Signature[] signatures;

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                if (packageInfo.signingInfo == null) {
                    return "";
                }
                signatures = packageInfo.signingInfo.getApkContentsSigners();
            } else {
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
                signatures = packageInfo.signatures;
            }

            if (signatures == null || signatures.length == 0) {
                return "";
            }

            String signatureChars = signatures[0].toCharsString();
            String appInfo = packageName + " " + signatureChars;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(appInfo.getBytes(StandardCharsets.UTF_8));
            String hash = Base64.encodeToString(md.digest(), Base64.NO_PADDING | Base64.NO_WRAP | Base64.URL_SAFE);
            return hash.substring(0, 11);
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException | RuntimeException error) {
            return "";
        }
    }
}
