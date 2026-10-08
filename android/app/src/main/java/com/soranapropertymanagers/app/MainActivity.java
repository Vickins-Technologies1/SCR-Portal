package com.soranapropertymanagers.app;

import com.getcapacitor.BridgeActivity;
import com.soranapropertymanagers.app.sms.SmsRetrieverPlugin;
import com.soranapropertymanagers.app.auth.GoogleAuthPlugin;
import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowCompat;
import android.graphics.Color;
import android.os.Build;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Add custom plugins to BridgeActivity's initial plugin list before the
        // bridge is created. This is the Capacitor 8-safe registration path and
        // prevents GoogleAuth from being reported as "not implemented" when
        // the web app is loaded from the production URL.
        initialPlugins.add(SmsRetrieverPlugin.class);
        initialPlugins.add(GoogleAuthPlugin.class);

        EdgeToEdge.enable(this);
        getWindow().setStatusBarColor(Color.rgb(15, 23, 42));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(false);
        }
        super.onCreate(savedInstanceState);
    }
}
