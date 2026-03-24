#!/bin/bash
# Local test runner for xiaohongshu-scraper

SCRAPER_DIR="/Users/jenny/.openclaw/workspace-bd-api/xiaohongshu-scraper"
cd "$SCRAPER_DIR"

# 1. Build the project
echo "Building project..."
npm run build

# 2. Run with test input
# Tip: Replace the 'cookie' value below with your actual Xiaohongshu cookie string
echo "Starting scraper test..."
APIFY_INPUT='{
  "mode": "search",
  "keyword": "coffee",
  "limit": 5,
  "maxPages": 1,
  "cookie": "abRequestId=fae0eb48-fdf6-5891-a210-daf644efa5ce; webBuild=6.1.3; xsecappid=xhs-pc-web; a1=19d1f4868c1q2p19hbhqvzpn6bihrdi3j7hb4690730000246588; webId=1b982483c267fb74d4991ac915eb518a; gid=yjfyi4YYD4VYyjfyi4YKYWKjSyAJUyjxDxAhx8WuUIKD3Dq8xFf3q4888J4K2YY8f8dd8yJD; acw_tc=0a00d56417743499964521512e412dbccc848076f63b2cb6f66ab67c55c716; loadts=1774349998395; web_session=040069b7a2d17c25652c6b27f73b4ba4cd2fe8; id_token=VjEAAIOnWRtJ1bnKiKjc7Jfhy2Ig+dWcehGXrc5D0nHlOwIqJp64IMOC+BSxfwNHJDTjUVzcmzSppIL+T8fsIe8W93gCasuPj8axOjyHKHbCUGisGjmXN2ilUzPVlOAdkQojh9zN; unread={%22ub%22:%2269b811f3000000001a029431%22%2C%22ue%22:%2269ba9afd000000001a036731%22%2C%22uc%22:55}; websectiga=a9bdcaed0af874f3a1431e94fbea410e8f738542fbb02df1e8e30c29ef3d91ac; sec_poison_id=093186d9-146c-4ee2-8af8-a68643e20592"
}' node dist/main.js

echo "Test complete. Results are in storage/datasets/default/"
