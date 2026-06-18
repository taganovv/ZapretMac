'use strict';

const fs = require('fs');
const path = require('path');

const HOST_LIST_YOUTUBE = `yt3.ggpht.com
yt4.ggpht.com
yt3.googleusercontent.com
googlevideo.com
jnn-pa.googleapis.com
wide-youtube.l.google.com
youtube-nocookie.com
youtube-ui.l.google.com
youtube.com
www.youtube.com
m.youtube.com
music.youtube.com
youtubeembeddedplayer.googleapis.com
youtubekids.com
youtube.googleapis.com
youtubei.googleapis.com
youtu.be
yt-video-upload.l.google.com
ytimg.com
ytimg.l.google.com
i.ytimg.com
s.ytimg.com
play.google.com
google.ru
google.com
www.google.com
gstatic.com
googleapis.com
googleusercontent.com
lh3.googleusercontent.com
ggpht.com
googleadservices.com
doubleclick.net
google-analytics.com
gvt1.com
gvt2.com`;

const HOST_LIST_EXCLUDE = `pusher.com
live-video.net
ttvnw.net
twitch.tv
mail.ru
citilink.ru
yandex.com
yandex.net
yandex.org
yandex.md
yandex.ru
yandexadexchange.net
yandexcloud.net
yandexcom.net
yandexmetrica.com
yandexwebcache.net
yandexwebcache.org
yastat.net
yastatic-net.ru
yastatic.net
ya.ru
adfox.ru
admetrica.ru
naydex.net
rostaxi.org
turbopages.org
webvisor.com
webvisor.org
nvidia.com
donationalerts.com
vk.com
yandex.kz
mts.ru
multimc.org
dns-shop.ru
habr.com
3dnews.ru
microsoft.com
microsoftonline.com
live.com
sharepoint.com
minecraft.net
xboxlive.com
akamaitechnologies.com
msi.com
2ip.ru
boosty.to
tanki.su
lesta.ru
korabli.su
tanksblitz.ru
reg.ru
epicgames.dev
epicgames.com
unrealengine.com
riotgames.com
riotcdn.net
leagueoflegends.com
playvalorant.com
marketplace.visualstudio.com
gallery.vsassets.io
gallerycdn.vsassets.io
gosuslugi.ru
gov.ru
nalog.ru
spb.ru
mos.ru
vk.ru
vk.me
vkvideo.ru
ok.ru
mycdn.me
okcdn.ru
odkl.ru
wb.ru
geobasket.ru
paywb.com
rwb.ru
wb-basket.ru
wbbasket.ru
wbpay.ru
wibes.ru
wildberries.ru
ozon.by
ozon.com
ozon.com.by
ozon.com.kz
ozon.kz
ozon.ru
ozon.tm
ozone.ru
ozonru.me
ozonusercontent.com
alfabank.ru
gazprombank.ru
gpb.ru
dbo-dengi.online
mtsdengi.ru
psbank.ru
bankline.ru
rosbank.ru
abr.ru
rshb.ru
sber.ru
sberbank.com
sberbank.ru
cdn-tinkoff.ru
tbank-online.com
tbank.ru
t-bank-app.ru
tochka-tech.com
tochka.com
vtb.ru
steamcommunity.com`;

function ensureHostLists(userDataPath) {
  const listsDir = path.join(userDataPath, 'lists');
  fs.mkdirSync(listsDir, { recursive: true });

  fs.writeFileSync(path.join(listsDir, 'list-youtube.txt'), HOST_LIST_YOUTUBE, 'utf8');
  fs.writeFileSync(path.join(listsDir, 'list-exclude.txt'), HOST_LIST_EXCLUDE, 'utf8');
  fs.writeFileSync(path.join(listsDir, 'list-all.txt'), HOST_LIST_YOUTUBE, 'utf8');

  return listsDir;
}

module.exports = { ensureHostLists };
