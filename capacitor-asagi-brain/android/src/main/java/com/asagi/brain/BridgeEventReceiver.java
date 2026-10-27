package com.asagi.brain;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BridgeEventReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !"asagi.brain.event".equals(intent.getAction())) {
            return;
        }
    }
}
