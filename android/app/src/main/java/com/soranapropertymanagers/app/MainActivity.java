package com.soranapropertymanagers.app;

import com.getcapacitor.BridgeActivity;
import com.soranapropertymanagers.app.sms.SmsRetrieverPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SmsRetrieverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
