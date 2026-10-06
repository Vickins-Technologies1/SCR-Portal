package com.soranapropertymanagers.app;

import com.getcapacitor.BridgeActivity;
import com.soranapropertymanagers.app.sms.SmsRetrieverPlugin;
import com.soranapropertymanagers.app.auth.GoogleAuthPlugin;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        registerPlugin(SmsRetrieverPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
