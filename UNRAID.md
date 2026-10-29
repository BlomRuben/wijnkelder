# Wijnkelder op Unraid

De app draait op je Unraid-server in een Docker-container. Je wijnen, foto's en
back-ups staan op de server, dus je ziet op elk apparaat dezelfde kelder.

## Hoe het in elkaar zit

```
pc (Claude past de app aan)
  → git push naar GitHub
    → GitHub bouwt automatisch een container-image (ghcr.io)
      → Unraid haalt de nieuwe image op ("Update")
```

| Onderdeel | Waar |
|---|---|
| De code | [github.com/BlomRuben/wijnkelder](https://github.com/BlomRuben/wijnkelder) (openbaar) |
| De container-image | `ghcr.io/blomruben/wijnkelder` |
| Je gegevens, foto's en dagelijkse kopieën | Unraid: `/mnt/user/appdata/wijnkelder` |

Je gegevens komen **nooit** op GitHub: ze staan alleen op Unraid, en `.gitignore`
houdt een lokale `data/`-map buiten git.

In de appdata-map:

| Bestand of map | Wat |
|---|---|
| `wijnkelder.json` | je wijnen, rekken en wensenlijst |
| `photos/` | je foto's |
| `backups/` | een kopie per dag, de laatste 30 dagen |

## Eenmalig: installeren

### 1–3. GitHub (al gedaan)
De repo [BlomRuben/wijnkelder](https://github.com/BlomRuben/wijnkelder) bestaat, is
gekoppeld aan deze map (via de GitHub-tool `gh`, ingelogd als BlomRuben), en de
eerste image is gebouwd en openbaar op te halen.

### 4. De container aanmaken
Unraid → **Docker** → **Add Container**:

| Veld | Waarde |
|---|---|
| Name | `wijnkelder` |
| Repository | `ghcr.io/blomruben/wijnkelder:latest` |
| Network Type | `Bridge` |
| WebUI | `http://[IP]:[PORT:8080]/` |

Daaronder via **Add another Path, Port, Variable, Label or Device**:

| Type | Name | Container | Host |
|---|---|---|---|
| Port | Web | `8080` | `8080` (of een andere vrije poort) |
| Path | Gegevens | `/data` | `/mnt/user/appdata/wijnkelder` |

Klik op **Apply** en open `http://<ip-van-je-server>:8080`.
Lukt het niet, kijk dan in het Docker-tabblad bij de container naar **Logs**.
Daar hoort te staan: `Wijnkelder draait op poort 8080, gegevens in /data`.

### 5. Je huidige gegevens verhuizen
1. Open de oude versie op je pc (dubbelklik `index.html`) → **Gegevens** → **Back-up downloaden**.
2. Open de app op de server → **Gegevens** → **Back-up terugzetten…** en kies dat bestand.

## Een nieuwe versie zetten (na wijzigingen met Claude)
1. Claude legt de wijziging vast in git (een *commit*).
2. `git push`
3. Wacht op het groene vinkje bij **Actions** op GitHub.
4. Unraid → **Docker** → **Check for Updates** → bij `wijnkelder` op **apply update** klikken.
   Automatisch kan ook: installeer de plugin **CA Auto Update Applications**.

Je gegevens blijven staan: die zitten in appdata, niet in de container.

### Terug naar een eerdere versie
Elke versie heeft ook een eigen code (de commit-code, te zien bij **Actions**).
Zet in Unraid bij Repository `ghcr.io/blomruben/wijnkelder:<commit-code>` in
plaats van `:latest`. Zet het later terug op `:latest` om weer mee te gaan met updates.

## Onderweg gebruiken
De app heeft geen wachtwoord. Zet poort 8080 dus **niet** open in je router.
Gebruik in plaats daarvan **Tailscale**: installeer de Tailscale-plugin op Unraid en
de Tailscale-app op je telefoon. Dan bereik je de app overal via het Tailscale-adres
van je server, alleen jij.

Tip: via gewoon `http://` mag de browser niet bij je klembord voor foto's, dus
“Kopieer de foto” werkt dan niet (de vraag kopiëren wel). Sleep de foto dan zelf in de
chat, of zet in Tailscale HTTPS aan (`tailscale serve`) om een `https://`-adres te krijgen.

## Back-ups
- De server bewaart elke dag een kopie in `backups/` (de laatste 30 dagen).
  Terugzetten: stop de container, kopieer de gewenste kopie (via de Unraid-terminal)
  naar `/mnt/user/appdata/wijnkelder/wijnkelder.json` en start de container.
- De Unraid-plugin **Appdata Backup** neemt de gegevensmap automatisch mee.
- Extra zekerheid: af en toe **Back-up downloaden** in de app (inclusief foto's).
