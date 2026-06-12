/* SunPath — ネイティブアプリ（Capacitor）専用処理
   広告バナー（AdMob）と「広告を削除」課金まわり。Web版では読み込まれない。
   現在は Google のテスト広告ID で動作。本番IDは AdMob アカウント開設後に差し替える。 */
(function(){
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  // ---- テスト用ID（本番リリース前に差し替え必須） ----
  var BANNER_AD_ID = 'ca-app-pub-3940256099942544/2934735716'; // Google公式のiOSバナーテストID
  var IS_TESTING = true;

  var noAds = false;
  try { noAds = localStorage.getItem('sunpath.noads') === '1'; } catch(e){}

  // 「広告を削除」リンク（課金はApp Store Connect設定後に本実装する）
  var btn = document.getElementById('noAdsBtn');
  if (btn && !noAds){
    btn.hidden = false;
    btn.addEventListener('click', function(){
      alert('広告削除の購入は正式リリース時に有効になります。\n（App Store Connect でのアプリ内課金設定後に実装）');
    });
  }
  if (noAds) return;

  // ---- AdMob バナー ----
  try {
    var AdMob = C.registerPlugin('AdMob');
    AdMob.addListener('bannerAdSizeChanged', function(info){
      window.__bannerHeight = (info && info.height) ? info.height : 0;
      if (window.__refitBottomUI) window.__refitBottomUI();
    });
    AdMob.initialize({})
      .then(function(){
        return AdMob.showBanner({
          adId: BANNER_AD_ID,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 0,
          isTesting: IS_TESTING
        });
      })
      .catch(function(err){
        // 広告が出せなくてもアプリ本体は動かす
        console.warn('AdMob init/show failed:', err);
      });
  } catch (e) {
    console.warn('AdMob plugin unavailable:', e);
  }
})();
