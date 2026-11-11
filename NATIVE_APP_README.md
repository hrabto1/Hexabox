# Hexabox jako Android/iOS appka

## Co už je hotové
- `android/` a `ios/` — kompletní nativní projekty (Capacitor), appka se jmenuje
  "Hexabox", ikona a splash screen jsou hotové.
- `dist/Hexabox-debug.apk` — nainstalovatelný testovací APK (jde rovnou nahrát
  do telefonu, stačí v telefonu povolit instalaci z neznámých zdrojů).
- `dist/Hexabox-release.apk` a `dist/Hexabox-release.aab` — podepsaná ostrá
  verze; `.aab` je přesně ten formát, který vyžaduje Google Play.
- `keystore/hexabox-release.keystore` — podpisový klíč pro Android (viz
  `keystore/DULEZITE-PRECTI.txt` — je to nenahraditelné, zálohuj si ho).
- Reklamy (AdMob) jsou zapojené s Googlem oficiálními TESTOVACÍMI ID — v appce
  se zobrazí jen jako "Test Ad", nic nevydělají. Než appku pošleš do obchodu,
  je potřeba:
  1. Založit si účet na https://admob.google.com (zdarma).
  2. Vytvořit appku a reklamní jednotky (banner + interstitial) pro Android a iOS.
  3. V `ads.js` nahradit `TEST_IDS` svými ID.
  4. V `android/app/src/main/AndroidManifest.xml` a `ios/App/App/Info.plist`
     nahradit `com.google.android.gms.ads.APPLICATION_ID` / `GADApplicationIdentifier`.

## Co musíš udělat ty sám (nejde to udělat za tebe)

### Android → Google Play
1. Založit účet Google Play Console (jednorázově 25 $): https://play.google.com/console
2. V Play Console vytvořit novou appku, vyplnit popis, screenshoty, zásady
   ochrany soukromí (povinné), věkové hodnocení.
3. Nahrát `dist/Hexabox-release.aab`.
4. Odeslat ke schválení (Google appku ručně/automaticky zkontroluje, trvá to
   řádově hodiny až pár dní).

### iOS → App Store
Tohle bohužel nejde udělat na Windows — Apple vyžaduje Mac s Xcode.
1. Potřebuješ Mac (vlastní, půjčený, nebo cloudová služba jako MacStadium).
2. Založit Apple Developer účet (99 $/rok): https://developer.apple.com
3. Na Macu otevřít `ios/App/App.xcodeproj` (nebo `.xcworkspace`), nastavit
   svůj Team/Signing v Xcode, přes Product → Archive appku sestavit a
   podepsat, nahrát do App Store Connect.
4. V App Store Connect vyplnit popis, screenshoty, zásady ochrany soukromí,
   odeslat ke schválení (Apple review trvá typicky 1–3 dny).

### Proč to nejde "rovnou"
Nahrání appky do obchodu vyžaduje tvůj vlastní vývojářský účet, platbu a
odsouhlasení podmínek Googlu/Applu tvým jménem — to je něco, co nemůže udělat
nikdo jiný než ty. Všechno ostatní (appka, ikony, podpis, build) je hotové a
čeká v `dist/`.

## Jak appku dál upravovat
1. Uprav `index.html` / `app.js` / `logic.js` / `levels.js` v kořeni projektu
   (je to stejný kód jako webová verze).
2. `npm run cap:sync` — zkopíruje web soubory do `www/` a prosynchronizuje
   Android/iOS projekty.
3. Android build (z PowerShellu, s JDK 21 v PATH):
   ```
   $env:JAVA_HOME = "build-tools\jdk-21.0.13+9"
   $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
   cd android
   .\gradlew.bat bundleRelease assembleRelease
   ```
   Výstup: `android/app/build/outputs/bundle/release/app-release.aab`.
4. iOS build: pouze na Macu v Xcode (viz výše).
