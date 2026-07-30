import React from 'react';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// Production banner unit for Property Deal Calculator (AdMob, iOS).
const UNIT_ID = 'ca-app-pub-9879821077971587/6284121138';

export default function AdBanner() {
  return (
    <BannerAd
      unitId={__DEV__ ? TestIds.BANNER : UNIT_ID}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}
