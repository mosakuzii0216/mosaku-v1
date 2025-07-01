# 公式の軽量なNginxイメージをベースにします
FROM nginx:stable-alpine

# この後作成するNginxの設定ファイル(nginx.conf)を、
# コンテナ内の正しい設定ファイルの場所にコピーします
COPY nginx.conf /etc/nginx/conf.d/default.conf