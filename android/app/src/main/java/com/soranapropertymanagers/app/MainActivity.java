package com.soranapropertymanagers.app;

import com.getcapacitor.BridgeActivity;
import com.soranapropertymanagers.app.sms.SmsRetrieverPlugin;
import com.soranapropertymanagers.app.auth.GoogleAuthPlugin;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        WindowCompat.enableEdgeToEdge(getWindow());
        registerPlugin(SmsRetrieverPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
