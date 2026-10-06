package com.soranapropertymanagers.app.auth;

import android.content.Intent;
import androidx.annotation.NonNull;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {
    private static final int REQUEST_CODE = 7301;
    private PluginCall pendingCall;

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId", "").trim();
        if (serverClientId.isEmpty()) {
            call.reject("Missing Google web client ID.");
            return;
        }

        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(serverClientId)
            .requestEmail()
            .build();
        GoogleSignInClient client = GoogleSignIn.getClient(getContext(), options);
        pendingCall = call;
        startActivityForResult(call, client.getSignInIntent(), REQUEST_CODE);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CODE || pendingCall == null) return;

        PluginCall call = pendingCall;
        pendingCall = null;
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String idToken = account.getIdToken();
            if (idToken == null || idToken.trim().isEmpty()) {
                call.reject("Google did not return an ID token.");
                return;
            }
            JSObject result = new JSObject();
            result.put("idToken", idToken);
            result.put("email", account.getEmail());
            result.put("name", account.getDisplayName());
            call.resolve(result);
        } catch (ApiException error) {
            call.reject("Google sign-in failed.", error);
        }
    }
}
