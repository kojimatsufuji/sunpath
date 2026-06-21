/* SunPath（ソラミチ）— ネイティブアプリ（Capacitor）専用処理
   広告バナー（AdMob）と「広告を削除」課金（cordova-plugin-purchase）。Web版では読み込まれない。
   広告は現在 Google のテスト広告ID で動作。App Store 提出用ビルドの直前に IS_TESTING を false へ。 */
(function(){
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  // ---- 設定 ----
  var BANNER_AD_ID = 'ca-app-pub-7386790459032565/5869378117'; // ソラミチ バナー（soramichi-banner）
  // 開発中は true（自分の端末で本番広告を表示・タップするとポリシー違反になるため）。
  // App Store 提出用ビルド向けに false（本番広告）に切替済み（2026-06-20）。
  // ※もしデバッグで実機/シミュレータ確認をやり直す場合は一時的に true に戻すこと。
  var IS_TESTING = false;
  var PRODUCT_ID = 'jp.soramichi.removeads'; // 「広告を削除」非消耗型（App Store Connect で同じIDを登録）

  var AdMob = null;
  var bannerListenerAdded = false;

  var noAdsBtn   = document.getElementById('noAdsBtn');
  var restoreBtn = document.getElementById('restoreBtn');

  function getNoAds(){ try { return localStorage.getItem('sunpath.noads') === '1'; } catch(e){ return false; } }
  function setNoAds(v){ try { localStorage.setItem('sunpath.noads', v ? '1' : '0'); } catch(e){} }

  function toast(msg){
    var t = document.getElementById('toast');
    if (!t){ try { alert(msg); } catch(e){} return; }
    t.textContent = msg; t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2400);
  }

  // ---- AdMob プラグイン解決（Capacitorのバージョン差異に対応）----
  function resolveAdMob(){
    if (AdMob) return AdMob;
    if (C.Plugins && C.Plugins.AdMob) AdMob = C.Plugins.AdMob;
    else if (typeof C.registerPlugin === 'function') AdMob = C.registerPlugin('AdMob');
    if (!AdMob){
      console.warn('AdMob not found. Capacitor keys:', Object.keys(C).join(','),
                   'Plugins:', C.Plugins ? Object.keys(C.Plugins).join(',') : 'none');
    }
    return AdMob;
  }

  function showBanner(){
    if (getNoAds()) return;
    var ad = resolveAdMob();
    if (!ad) return;
    if (!bannerListenerAdded){
      ad.addListener('bannerAdSizeChanged', function(info){
        window.__bannerHeight = (info && info.height) ? info.height : 0;
        if (window.__refitBottomUI) window.__refitBottomUI();
      });
      bannerListenerAdded = true;
    }
    ad.initialize({})
      .then(function(){
        return ad.showBanner({
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
  }

  function removeBanner(){
    var ad = resolveAdMob();
    if (ad){
      try {
        if (ad.removeBanner) ad.removeBanner();
        else if (ad.hideBanner) ad.hideBanner();
      } catch(e){ console.warn('removeBanner failed:', e); }
    }
    window.__bannerHeight = 0;
    if (window.__refitBottomUI) window.__refitBottomUI();
  }

  // 購入/復元が成立したとき：記録・広告除去・ボタン非表示
  function applyNoAds(){
    setNoAds(true);
    removeBanner();
    if (noAdsBtn) noAdsBtn.hidden = true;
    if (restoreBtn) restoreBtn.hidden = true;
  }

  // ---- アプリ内課金（cordova-plugin-purchase / グローバル CdvPurchase）----
  // Capacitor が Cordova プラグインJSを注入するまで少し待つ
  function whenPurchaseReady(cb, tries){
    tries = tries || 0;
    if (window.CdvPurchase && window.CdvPurchase.store){ cb(); return; }
    if (tries > 50){ console.warn('CdvPurchase did not load (purchases unavailable)'); return; }
    setTimeout(function(){ whenPurchaseReady(cb, tries + 1); }, 100);
  }

  function setupIAP(){
    var CdvPurchase = window.CdvPurchase;
    var store = CdvPurchase.store;
    var Platform = CdvPurchase.Platform;
    var ProductType = CdvPurchase.ProductType;
    var ErrorCode = CdvPurchase.ErrorCode;

    store.register([{
      id: PRODUCT_ID,
      type: ProductType.NON_CONSUMABLE,
      platform: Platform.APPLE_APPSTORE
    }]);

    function refreshOwnership(){
      var p = store.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
      if (p && p.owned) applyNoAds();
    }

    // 検証バリデータ（自前サーバ）は持たないため、approved で finish する簡易構成。
    store.when()
      .approved(function(transaction){ transaction.finish(); })
      .finished(function(){ refreshOwnership(); })
      .receiptUpdated(function(){ refreshOwnership(); });

    // 背景の読込エラー（オフライン等）はログのみ。ユーザー操作時のエラーは各ボタン側で扱う。
    store.error(function(err){ console.warn('IAP error:', err); });

    function isCancelled(res){
      return res && ErrorCode && res.code === ErrorCode.PAYMENT_CANCELLED;
    }

    function bindButtons(){
      if (getNoAds()) return; // 購入済みなら出さない
      if (noAdsBtn){
        noAdsBtn.hidden = false;
        noAdsBtn.onclick = function(){
          var p = store.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
          var offer = (p && p.getOffer) ? p.getOffer() : null;
          if (!offer){ toast('商品情報を取得できませんでした'); return; }
          // store.order は Promise<IError|undefined> を返す（v13）
          store.order(offer).then(function(res){
            if (res && res.isError && !isCancelled(res)) toast('購入できませんでした');
          });
        };
      }
      if (restoreBtn){
        restoreBtn.hidden = false;
        restoreBtn.onclick = function(){
          toast('購入を復元しています…');
          store.restorePurchases().then(function(res){
            if (res && res.isError && !isCancelled(res)) toast('復元できませんでした');
            else refreshOwnership();
          });
        };
      }
      // ボタンを表示するとパネルが高くなるため、広告バナーとの重なりを防ぐよう再配置する
      var refit = window.__refitBottomUI;
      if (refit){ refit(); setTimeout(refit, 100); }
    }

    store.initialize([Platform.APPLE_APPSTORE])
      .then(function(){ return store.update(); })
      .then(function(){ refreshOwnership(); bindButtons(); })
      .catch(function(e){ console.warn('store init failed:', e); });
  }

  // ---- 起動 ----
  if (!getNoAds()) showBanner();   // 未購入なら広告バナー表示
  whenPurchaseReady(setupIAP);     // 購入/復元の準備（購入済みなら所有確認で広告除去）
})();
