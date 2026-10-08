package com.soranapropertymanagers.app;

import com.getcapacitor.BridgeActivity;
import com.soranapropertymanagers.app.sms.SmsRetrieverPlugin;
import com.soranapropertymanagers.app.auth.GoogleAuthPlugin;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SmsRetrieverPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
