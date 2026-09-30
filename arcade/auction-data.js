/* 临江拍卖行 / original gameplay data. Existing project streamer identities only. */
(function (root) {
'use strict';
const hosts = [
 ['塔菲','层层拆谜','第1、2、3轮各随机揭示1件未知品质。','ladder','#e5b8be','项目平衡版'],
 ['红蔷薇','聚光追踪','第1轮随机揭示2件轮廓，第2、4轮依次完整鉴定这2件。','track','#d4787d','项目平衡版'],
 ['东雪莲','细节辨色','第1轮随机揭示2件类别及其中1件轮廓；第2轮揭示该件品质，第3轮完整鉴定另一件。','common','#a6bdd6','项目平衡版'],
 ['沙花叉','分类寻宝','第1轮随机揭示2件的轮廓与类别；第3、4轮依次揭示这2件的品质。','category-wave','#afafb8','项目平衡版'],
 ['时雨羽衣','色彩铺陈','第1轮随机揭示1件的轮廓与品质；第3、5轮各随机揭示1件未知品质。','colour-wave','#bfd2ac','项目平衡版'],
 ['斯黛拉','压轴星光','第1轮随机揭示2件未知轮廓，第3轮随机揭示1件未知品质，第5轮再揭示至多3件未知品质。','finale','#c3b3d6','项目平衡版'],
 ['璃亚梦','命运切片','第1、3、5轮各随机触发一项：鉴定1件、揭示1件品质、揭示1件轮廓与品质，或揭示2件轮廓与类别。','fortune','#eba8c6','项目平衡版'],
 ['兔子洞初音','焦点巡回','第1轮随机揭示1件的轮廓与类别，第2轮揭示该件品质；第4轮另随机揭示至多2件的轮廓与品质。','apex','#95ccc8','项目平衡版'],
 ['神乐七奈','珍品抽检','第1轮随机抽取2件，仅得知其中史诗与传说的合计件数；第3轮揭示这2件的品质。','rare-count','#a3bce6','项目平衡版'],
 ['鲸鱼娘','估价回声','第1轮随机选定2件，仅揭示其中1件轮廓；第2轮得知这2件的合计价值。','analyst','#8eadd5','项目平衡版'],
 ['牛肉','大件优先','第1轮揭示最大占格藏品的轮廓，第2轮揭示该件品质，第4轮完整鉴定；第3轮另随机揭示1件未知品质。','large-track','#b4cabe','项目平衡版'],
].map(([name,skill,desc,effect,color,reference],id)=>({id,name,skill,desc,effect,color,reference,portrait:`assets/auction/hosts/${name}.webp`,avatar:`assets/auction/hosts/${name}-avatar.webp`}));
const qualities=[{"name": "寻常", "color": "#adb7bf", "label": "C"}, {"name": "精良", "color": "#8ccb9a", "label": "B"}, {"name": "稀有", "color": "#80bce8", "label": "A"}, {"name": "史诗", "color": "#bb9bec", "label": "S"}, {"name": "传说", "color": "#ffbc61", "label": "SS"}];
const series=[{"id": "signal", "name": "失物电波", "category": "电子"}, {"id": "playroom", "name": "童年放映室", "category": "玩具"}, {"id": "encore", "name": "午夜安可", "category": "音乐"}, {"id": "atelier", "name": "手作小宇宙", "category": "工艺"}, {"id": "roadtrip", "name": "城市漫游", "category": "模型"}, {"id": "pantry", "name": "甜蜜补给站", "category": "食玩"}, {"id": "archive", "name": "旧城记忆", "category": "古物"}, {"id": "anomaly", "name": "异常观察局", "category": "奇物"}];
const catalog=[
 {
  "id": 0,
  "key": "signal-01",
  "name": "口袋收音机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/signal-01.webp"
 },
 {
  "id": 1,
  "key": "signal-02",
  "name": "软盘盒",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/signal-02.webp"
 },
 {
  "id": 2,
  "key": "signal-03",
  "name": "老式呼机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/signal-03.webp"
 },
 {
  "id": 3,
  "key": "signal-04",
  "name": "胶片相机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/signal-04.webp"
 },
 {
  "id": 4,
  "key": "signal-05",
  "name": "薄荷游戏机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/signal-05.webp"
 },
 {
  "id": 5,
  "key": "signal-06",
  "name": "磁带随身听",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 1,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/signal-06.webp"
 },
 {
  "id": 6,
  "key": "signal-07",
  "name": "猫耳耳机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/signal-07.webp"
 },
 {
  "id": 7,
  "key": "signal-08",
  "name": "小电视",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/signal-08.webp"
 },
 {
  "id": 8,
  "key": "signal-09",
  "name": "打字机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/signal-09.webp"
 },
 {
  "id": 9,
  "key": "signal-10",
  "name": "星际寻呼仪",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/signal-10.webp"
 },
 {
  "id": 10,
  "key": "signal-11",
  "name": "透明掌机",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/signal-11.webp"
 },
 {
  "id": 11,
  "key": "signal-12",
  "name": "零号终端",
  "series": "signal",
  "seriesName": "失物电波",
  "category": "电子",
  "w": 2,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/signal-12.webp"
 },
 {
  "id": 12,
  "key": "playroom-01",
  "name": "黄色小鸭",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/playroom-01.webp"
 },
 {
  "id": 13,
  "key": "playroom-02",
  "name": "悠悠球",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/playroom-02.webp"
 },
 {
  "id": 14,
  "key": "playroom-03",
  "name": "积木小屋",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 2,
  "h": 2,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/playroom-03.webp"
 },
 {
  "id": 15,
  "key": "playroom-04",
  "name": "发条机器人",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/playroom-04.webp"
 },
 {
  "id": 16,
  "key": "playroom-05",
  "name": "纸箱恐龙",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/playroom-05.webp"
 },
 {
  "id": 17,
  "key": "playroom-06",
  "name": "星星陀螺",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 1,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/playroom-06.webp"
 },
 {
  "id": 18,
  "key": "playroom-07",
  "name": "宇航熊",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/playroom-07.webp"
 },
 {
  "id": 19,
  "key": "playroom-08",
  "name": "街机迷你柜",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/playroom-08.webp"
 },
 {
  "id": 20,
  "key": "playroom-09",
  "name": "鲸鱼水枪",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/playroom-09.webp"
 },
 {
  "id": 21,
  "key": "playroom-10",
  "name": "纸月木马",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 2,
  "h": 2,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/playroom-10.webp"
 },
 {
  "id": 22,
  "key": "playroom-11",
  "name": "机械企鹅",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/playroom-11.webp"
 },
 {
  "id": 23,
  "key": "playroom-12",
  "name": "彩虹独角兽",
  "series": "playroom",
  "seriesName": "童年放映室",
  "category": "玩具",
  "w": 2,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/playroom-12.webp"
 },
 {
  "id": 24,
  "key": "encore-01",
  "name": "橙心唱片",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 2,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/encore-01.webp"
 },
 {
  "id": 25,
  "key": "encore-02",
  "name": "樱桃沙锤",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/encore-02.webp"
 },
 {
  "id": 26,
  "key": "encore-03",
  "name": "口袋口琴",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/encore-03.webp"
 },
 {
  "id": 27,
  "key": "encore-04",
  "name": "小号节拍器",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/encore-04.webp"
 },
 {
  "id": 28,
  "key": "encore-05",
  "name": "薄荷麦克风",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/encore-05.webp"
 },
 {
  "id": 29,
  "key": "encore-06",
  "name": "落日吉他",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/encore-06.webp"
 },
 {
  "id": 30,
  "key": "encore-07",
  "name": "紫色合成器",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/encore-07.webp"
 },
 {
  "id": 31,
  "key": "encore-08",
  "name": "云朵八音盒",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/encore-08.webp"
 },
 {
  "id": 32,
  "key": "encore-09",
  "name": "霓虹鼓机",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/encore-09.webp"
 },
 {
  "id": 33,
  "key": "encore-10",
  "name": "星轨留声机",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 2,
  "h": 2,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/encore-10.webp"
 },
 {
  "id": 34,
  "key": "encore-11",
  "name": "月光小提琴",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/encore-11.webp"
 },
 {
  "id": 35,
  "key": "encore-12",
  "name": "天使竖琴",
  "series": "encore",
  "seriesName": "午夜安可",
  "category": "音乐",
  "w": 1,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/encore-12.webp"
 },
 {
  "id": 36,
  "key": "atelier-01",
  "name": "釉白茶杯",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/atelier-01.webp"
 },
 {
  "id": 37,
  "key": "atelier-02",
  "name": "风铃",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 2,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/atelier-02.webp"
 },
 {
  "id": 38,
  "key": "atelier-03",
  "name": "纸鹤",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/atelier-03.webp"
 },
 {
  "id": 39,
  "key": "atelier-04",
  "name": "青瓷花瓶",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/atelier-04.webp"
 },
 {
  "id": 40,
  "key": "atelier-05",
  "name": "橘猫陶偶",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 1,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/atelier-05.webp"
 },
 {
  "id": 41,
  "key": "atelier-06",
  "name": "彩窗灯",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/atelier-06.webp"
 },
 {
  "id": 42,
  "key": "atelier-07",
  "name": "雪山水晶球",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/atelier-07.webp"
 },
 {
  "id": 43,
  "key": "atelier-08",
  "name": "狐面",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/atelier-08.webp"
 },
 {
  "id": 44,
  "key": "atelier-09",
  "name": "锦鲤摆件",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/atelier-09.webp"
 },
 {
  "id": 45,
  "key": "atelier-10",
  "name": "金线折扇",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 1,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/atelier-10.webp"
 },
 {
  "id": 46,
  "key": "atelier-11",
  "name": "琉璃莲花",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/atelier-11.webp"
 },
 {
  "id": 47,
  "key": "atelier-12",
  "name": "日冕陶盘",
  "series": "atelier",
  "seriesName": "手作小宇宙",
  "category": "工艺",
  "w": 2,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/atelier-12.webp"
 },
 {
  "id": 48,
  "key": "roadtrip-01",
  "name": "红色滑板",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/roadtrip-01.webp"
 },
 {
  "id": 49,
  "key": "roadtrip-02",
  "name": "黄色出租车",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/roadtrip-02.webp"
 },
 {
  "id": 50,
  "key": "roadtrip-03",
  "name": "双层巴士",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/roadtrip-03.webp"
 },
 {
  "id": 51,
  "key": "roadtrip-04",
  "name": "奶油摩托",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/roadtrip-04.webp"
 },
 {
  "id": 52,
  "key": "roadtrip-05",
  "name": "复古跑车",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/roadtrip-05.webp"
 },
 {
  "id": 53,
  "key": "roadtrip-06",
  "name": "蓝色电车",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/roadtrip-06.webp"
 },
 {
  "id": 54,
  "key": "roadtrip-07",
  "name": "直升机模型",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/roadtrip-07.webp"
 },
 {
  "id": 55,
  "key": "roadtrip-08",
  "name": "月面越野车",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/roadtrip-08.webp"
 },
 {
  "id": 56,
  "key": "roadtrip-09",
  "name": "瓶中帆船",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/roadtrip-09.webp"
 },
 {
  "id": 57,
  "key": "roadtrip-10",
  "name": "极光飞船",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/roadtrip-10.webp"
 },
 {
  "id": 58,
  "key": "roadtrip-11",
  "name": "深海潜艇",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 1,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/roadtrip-11.webp"
 },
 {
  "id": 59,
  "key": "roadtrip-12",
  "name": "星穹列车",
  "series": "roadtrip",
  "seriesName": "城市漫游",
  "category": "模型",
  "w": 2,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/roadtrip-12.webp"
 },
 {
  "id": 60,
  "key": "pantry-01",
  "name": "草莓汽水",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/pantry-01.webp"
 },
 {
  "id": 61,
  "key": "pantry-02",
  "name": "桃子果酱",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/pantry-02.webp"
 },
 {
  "id": 62,
  "key": "pantry-03",
  "name": "云朵棉花糖",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/pantry-03.webp"
 },
 {
  "id": 63,
  "key": "pantry-04",
  "name": "猫爪饼干罐",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/pantry-04.webp"
 },
 {
  "id": 64,
  "key": "pantry-05",
  "name": "柠檬糖盒",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 2,
  "h": 1,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/pantry-05.webp"
 },
 {
  "id": 65,
  "key": "pantry-06",
  "name": "熊猫便当",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 2,
  "h": 1,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/pantry-06.webp"
 },
 {
  "id": 66,
  "key": "pantry-07",
  "name": "樱花茶罐",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/pantry-07.webp"
 },
 {
  "id": 67,
  "key": "pantry-08",
  "name": "星空棒棒糖",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/pantry-08.webp"
 },
 {
  "id": 68,
  "key": "pantry-09",
  "name": "月兔月饼盒",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/pantry-09.webp"
 },
 {
  "id": 69,
  "key": "pantry-10",
  "name": "水晶蜜罐",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/pantry-10.webp"
 },
 {
  "id": 70,
  "key": "pantry-11",
  "name": "彩虹蛋糕",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 2,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/pantry-11.webp"
 },
 {
  "id": 71,
  "key": "pantry-12",
  "name": "金箔可可杯",
  "series": "pantry",
  "seriesName": "甜蜜补给站",
  "category": "食玩",
  "w": 1,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/pantry-12.webp"
 },
 {
  "id": 72,
  "key": "archive-01",
  "name": "邮差皮包",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 2,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/archive-01.webp"
 },
 {
  "id": 73,
  "key": "archive-02",
  "name": "铜钥匙",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 1,
  "h": 2,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/archive-02.webp"
 },
 {
  "id": 74,
  "key": "archive-03",
  "name": "旧街路牌",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/archive-03.webp"
 },
 {
  "id": 75,
  "key": "archive-04",
  "name": "黄铜怀表",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 1,
  "h": 1,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/archive-04.webp"
 },
 {
  "id": 76,
  "key": "archive-05",
  "name": "旅行皮箱",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/archive-05.webp"
 },
 {
  "id": 77,
  "key": "archive-06",
  "name": "煤油提灯",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/archive-06.webp"
 },
 {
  "id": 78,
  "key": "archive-07",
  "name": "折叠望远镜",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/archive-07.webp"
 },
 {
  "id": 79,
  "key": "archive-08",
  "name": "航海罗盘",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 1,
  "h": 1,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/archive-08.webp"
 },
 {
  "id": 80,
  "key": "archive-09",
  "name": "珐琅胸针",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 1,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/archive-09.webp"
 },
 {
  "id": 81,
  "key": "archive-10",
  "name": "机械座钟",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 2,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/archive-10.webp"
 },
 {
  "id": 82,
  "key": "archive-11",
  "name": "珊瑚王冠",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 2,
  "h": 1,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/archive-11.webp"
 },
 {
  "id": 83,
  "key": "archive-12",
  "name": "初代城徽",
  "series": "archive",
  "seriesName": "旧城记忆",
  "category": "古物",
  "w": 1,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/archive-12.webp"
 },
 {
  "id": 84,
  "key": "anomaly-01",
  "name": "微光蘑菇",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 50,
  "image": "assets/auction/items/anomaly-01.webp"
 },
 {
  "id": 85,
  "key": "anomaly-02",
  "name": "瓶装雨云",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 60,
  "image": "assets/auction/items/anomaly-02.webp"
 },
 {
  "id": 86,
  "key": "anomaly-03",
  "name": "困困石头",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 1,
  "quality": 0,
  "base": 69,
  "image": "assets/auction/items/anomaly-03.webp"
 },
 {
  "id": 87,
  "key": "anomaly-04",
  "name": "漂浮茶壶",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 2,
  "h": 2,
  "quality": 1,
  "base": 126,
  "image": "assets/auction/items/anomaly-04.webp"
 },
 {
  "id": 88,
  "key": "anomaly-05",
  "name": "倒转沙漏",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 141,
  "image": "assets/auction/items/anomaly-05.webp"
 },
 {
  "id": 89,
  "key": "anomaly-06",
  "name": "发芽磁铁",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 2,
  "quality": 1,
  "base": 156,
  "image": "assets/auction/items/anomaly-06.webp"
 },
 {
  "id": 90,
  "key": "anomaly-07",
  "name": "星屑水晶",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 2,
  "quality": 2,
  "base": 300,
  "image": "assets/auction/items/anomaly-07.webp"
 },
 {
  "id": 91,
  "key": "anomaly-08",
  "name": "月亮标本",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 326,
  "image": "assets/auction/items/anomaly-08.webp"
 },
 {
  "id": 92,
  "key": "anomaly-09",
  "name": "口袋黑洞",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 2,
  "h": 2,
  "quality": 2,
  "base": 353,
  "image": "assets/auction/items/anomaly-09.webp"
 },
 {
  "id": 93,
  "key": "anomaly-10",
  "name": "方糖宇宙",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 1,
  "quality": 3,
  "base": 610,
  "image": "assets/auction/items/anomaly-10.webp"
 },
 {
  "id": 94,
  "key": "anomaly-11",
  "name": "时间胶囊",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 1,
  "h": 2,
  "quality": 3,
  "base": 652,
  "image": "assets/auction/items/anomaly-11.webp"
 },
 {
  "id": 95,
  "key": "anomaly-12",
  "name": "迷你日蚀",
  "series": "anomaly",
  "seriesName": "异常观察局",
  "category": "奇物",
  "w": 2,
  "h": 2,
  "quality": 4,
  "base": 1236,
  "image": "assets/auction/items/anomaly-12.webp"
 }
];
// Public catalog v2. Keep the old unit prices for unfinished v1 auctions only.
const pricingVersion=2,qualityPriceFactors=[1,1.5,2.5,5,10];
for(const item of catalog){item.legacyBase=item.base;item.base=Math.round(item.base*qualityPriceFactors[item.quality]);}
const catalogPrice=(item,scale=1,version=pricingVersion)=>Math.round((version===1?(item.legacyBase??item.base):item.base)*scale);
const venues=[
 {id:'street',name:'旧街寻宝',subtitle:'OLD TOWN / 01',desc:'以寻常、精良藏品为主。',scale:1,min:100,entryFee:150,rarity:[.58,.29,.105,.021,.004],tag:'入门会场',lots:1},
 {id:'dock',name:'夜港秘藏',subtitle:'NIGHT HARBOR / 02',desc:'以精良、稀有藏品为主。',scale:10,min:30000,entryFee:3000,rarity:[.25,.36,.27,.10,.02],tag:'进阶会场',lots:1},
 {id:'sky',name:'云端珍品',subtitle:'SKYLINE / 03',desc:'以稀有、史诗藏品为主。',scale:100,min:600000,entryFee:60000,rarity:[.08,.22,.37,.24,.09],tag:'高阶会场',lots:1}
];
// NPC liquidity follows public venue prices, never the player's wallet or hidden lot.
for(const venue of venues){
 const mean=qualities.reduce((sum,_,q)=>{const pool=catalog.filter(c=>c.quality===q);return sum+venue.rarity[q]*pool.reduce((n,c)=>n+c.base,0)/pool.length;},0);
 venue.npcBudget=Math.round(mean*7*1.8*venue.scale);
}
// Local prices, not NTE currency conversion. Counts scaled for our 6–8 item boxes.
const tools=[];
function instrument(id,name,tier,cost,effect,desc,symbol='⌖',minRound=1){tools.push({id,name,tier,cost,effect,desc:(minRound>1?`第${minRound}轮起可用。`:'')+desc,symbol,minRound});}
for(const [tier,label,quality,shape,identify,costs] of [
 [0,'微型',1,2,1,[12,10,30]], [1,'小型',2,3,2,[28,22,80]],
 [2,'中型',3,4,3,[65,45,180]], [3,'高级',4,5,4,[140,100,360]], [4,'超级',5,6,5,[250,180,650]]]){
 instrument('quality-'+tier,label+'品鉴仪',tier,costs[0],{kind:'quality',count:quality},`随机揭示至多${quality}件藏品的未知品质，不揭示轮廓。`,'◈',tier+1);
 instrument('shape-'+tier,label+'尺寸仪',tier,costs[1],{kind:'shape',count:shape},`随机揭示至多${shape}件藏品的未知轮廓。`,'▧',tier+1);
 instrument('identify-'+tier,label+'鉴定仪',tier,costs[2],{kind:'identify',count:identify},`随机完整鉴定至多${identify}件未鉴定藏品。`,'⌖',tier+1);
}
for(const [q,label,tier,cost] of [[1,'精良',0,12],[2,'稀有',1,28],[3,'史诗',2,65],[4,'传说',3,140]]){
 for(const [stat,title,ratio] of [['count','计数',1],['mean','均价',.6],['total','估值',q===4?1:1.4]])
 instrument(`${stat}-${q}`,label+title+'仪',tier,Math.round(cost*ratio),{kind:'stat',stat,filter:{quality:q},sampleSize:3},`固定抽样3件，读取其中${label}藏品的${stat==='total'?'总价值':stat==='mean'?'平均价值（向下取整）':'件数'}；各抽样仪器共用同组样本。`,'▤',q);
}
for(const c of series)instrument('category-'+c.id,c.category+'品鉴仪',1,35,{kind:'quality',count:2,filter:{category:c.category},category:true,noCountFallback:true},`随机揭示至多2件${c.category}藏品的类别和品质，不揭示轮廓。`,'◇');
instrument('largest-shape','特殊尺寸仪',2,8,{kind:'shape',count:1,select:'largest'},'揭示1件占格最多藏品的轮廓。','▧');
instrument('largest-identify','特殊鉴定仪',3,60,{kind:'identify',count:1,select:'largest'},'完整鉴定1件占格最多的藏品。','⌖',2);
instrument('supreme','至尊鉴定仪',5,240,{kind:'identify',count:3,select:'ungraded'},'随机完整鉴定至多3件品质未知的藏品。','⌖',3);
for(const [q,label,cost] of [[1,'精良',12],[3,'史诗',65],[4,'传说',140]])instrument('area-'+q,label+'占格仪',q===1?0:q===3?2:3,cost,{kind:'stat',stat:'area',filter:{quality:q},sampleSize:3},`固定抽样3件，读取其中${label}藏品的占格总数；各抽样仪器共用同组样本。`,'▧',q);
instrument('largest-quality','特殊品鉴仪',3,20,{kind:'quality',count:1,select:'largest'},'揭示1件占格最多藏品的品质，不揭示轮廓。','◈',2);
instrument('largest-value','特殊估值仪',4,32,{kind:'stat',stat:'largestValue'},'得知1件占格最多藏品的价值，不揭示身份或位置。','▤',2);
const toolTiers=['入门','进阶','专业','高级','超级','至尊'];
const economy=Object.freeze({compensationRate:.10,compensationPerLot:40,compensationDaily:60,poolRate:.30,stakeRate:.10,participationFeeFactor:2,participationHistoryRatio:.60});
root.AuctionData=Object.freeze({hosts,catalog,qualities,series,venues,tools,toolTiers,economy,pricingVersion,catalogPrice});
})(globalThis);
/* Private-information operations shared by player and NPC. Never export raw hidden items. */
(function(root){
'use strict';
const D=root.AuctionData, copy=x=>JSON.parse(JSON.stringify(x));
const value=(i,scale)=>Math.round(i.base*scale);
function empty(i){return {slot:i.slot,x:null,y:null,w:null,h:null,quality:null,category:null,identified:null};}
function match(i,f={}){return (f.quality==null||i.quality===f.quality)&&(f.minQuality==null||i.quality>=f.minQuality)&&(!f.category||i.category===f.category);}
function candidates(i){return D.catalog.filter(c=>(i.w==null||c.w===i.w)&&(i.h==null||c.h===i.h)&&(i.quality==null||c.quality===i.quality)&&(!i.category||c.category===i.category)&&(i.identified==null||c.id===i.identified));}
function reveal(raw,seen,kind,category=false){
 const before=JSON.stringify(seen);
 if(kind==='shape'||kind==='shape-quality'||kind==='identify'){for(const k of ['x','y','w','h'])seen[k]=raw[k];}
 if(kind==='quality'||kind==='shape-quality'||kind==='identify')seen.quality=raw.quality;
 if(category||kind==='category'||kind==='identify')seen.category=raw.category;
 if(kind==='identify')seen.identified=raw.id;
 return before!==JSON.stringify(seen);
}
function useful(i,spec){if(spec.kind==='category')return !i.category;if(spec.kind==='identify')return i.identified==null;if(spec.kind==='quality')return i.quality==null||(spec.category&&!i.category);if(spec.kind==='shape')return i.w==null;return i.w==null||i.quality==null;}
function apply(raw,intel,facts,spec,rng,scale=1){
 if(spec.sampleSize){
  const cohort=facts.find(f=>f.scopeGroup==='instruments')?.scope||sampleSlots(raw,spec.sampleSize,rng);
  spec={...spec,sampleSize:0,scope:cohort,scopeGroup:'instruments'};
 }
 let pool=raw.filter(i=>(!spec.scope||spec.scope.includes(i.slot))&&match(i,spec.filter)),chosen=[];
 if(spec.kind==='stat'){
  const key=JSON.stringify(spec.scope?[spec.stat,spec.filter||{},spec.scope]:[spec.stat,spec.filter||{}]);if(facts.some(f=>f.key===key))return null;
  const sum=pool.reduce((n,i)=>n+value(i,scale),0),largest=pool.slice().sort((a,b)=>b.w*b.h-a.w*a.h||a.slot-b.slot)[0],v=spec.stat==='count'?pool.length:spec.stat==='mean'?(pool.length?Math.floor(sum/pool.length):0):spec.stat==='area'?pool.reduce((n,i)=>n+i.w*i.h,0):spec.stat==='largestValue'?value(largest,scale):sum;
  const subject=spec.filter?.quality!=null?D.qualities[spec.filter.quality].name+'藏品':spec.filter?.minQuality!=null?D.qualities.slice(spec.filter.minQuality).map(q=>q.name).join('与')+'藏品':spec.filter?.category?spec.filter.category+'藏品':'';
  const fact={key,stat:spec.stat,filter:copy(spec.filter||{}),value:v,...(spec.scope?{scope:[...spec.scope],scopeGroup:spec.scopeGroup||'skill'}:{})};facts.push(fact);return {fact,text:`${spec.scope?'样本 '+spec.scope.map(n=>'#'+(n+1)).join('、')+' · ':''}${subject}${spec.stat==='count'?'件数':spec.stat==='mean'?'平均价值（向下取整）':spec.stat==='area'?'占格总数':spec.stat==='largestValue'?'最大占格藏品价值（位置未知）':'总价值'}：${v}`,slots:[]};
 }
 if(spec.slots)pool=pool.filter(i=>spec.slots.includes(i.slot));
 if(spec.select==='ungraded')pool=pool.filter(i=>intel.find(x=>x.slot===i.slot).quality==null);
 if(['pristine-top','pristine'].includes(spec.select))pool=pool.filter(i=>{const o=intel.find(x=>x.slot===i.slot);return o.w==null&&o.quality==null&&!o.category&&o.identified==null;});
 // Largest and top-quality selection happens before usefulness filtering; no silently switching targets.
 if(spec.select==='largest')pool=pool.sort((a,b)=>b.w*b.h-a.w*a.h||a.slot-b.slot).slice(0,1);
 if(['top-quality','pristine-top'].includes(spec.select))pool=pool.sort((a,b)=>b.quality-a.quality||a.slot-b.slot).slice(0,1);
 pool=pool.filter(i=>useful(intel.find(x=>x.slot===i.slot),spec));
 if((!spec.select||['pristine','ungraded'].includes(spec.select))&&!spec.slots)for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 chosen=pool.slice(0,spec.count??pool.length);
 if(!chosen.length){if(spec.filter&&!spec.noCountFallback)return apply(raw,intel,facts,{kind:'stat',stat:'count',filter:spec.filter},rng,scale);return null;}
 for(const i of chosen)reveal(i,intel.find(x=>x.slot===i.slot),spec.kind,spec.category);
 return {slots:chosen.map(i=>i.slot),text:`新增 ${chosen.length} 件${spec.kind==='category'?'类别':spec.kind==='identify'?'完整鉴定':spec.kind==='shape'?(spec.category?'轮廓与类别':'轮廓'):spec.kind==='quality'?(spec.category?'类别与品质':'品质'):'轮廓与品质'}情报`};
}
function sampleSlots(raw,count,rng){const slots=raw.map(i=>i.slot);for(let i=slots.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}return slots.slice(0,count);}
function skill(effect,round,raw,intel,facts,memory,rng,scale){
 const specs=[],mark=(key,count)=>memory[key]??=sampleSlots(raw,count,rng);
 if(effect==='ladder'&&[1,2,3].includes(round))specs.push({kind:'quality',count:1});
 if(effect==='track'){
  if(round===1)specs.push({kind:'shape',slots:mark('tracked',2)});
  if([2,4].includes(round))specs.push({kind:'identify',slots:(memory.tracked||[]).slice(round===2?0:1,round===2?1:2)});
 }
 if(effect==='common'){
  if(round===1){specs.push({kind:'category',slots:mark('detailSample',2)});specs.push({kind:'shape',slots:memory.detailSample.slice(0,1)});}
  if(round===2)specs.push({kind:'shape-quality',slots:(memory.detailSample||[]).slice(0,1)});
  if(round===3)specs.push({kind:'identify',slots:(memory.detailSample||[]).slice(1,2)});
 }
 if(effect==='category-wave'){
  if(round===1)specs.push({kind:'shape',category:true,slots:mark('categorySample',2)});
  if([3,4].includes(round))specs.push({kind:'quality',slots:(memory.categorySample||[]).slice(round-3,round-2)});
 }
 if(effect==='colour-wave'&&[1,3,5].includes(round))specs.push({kind:round===1?'shape-quality':'quality',count:1});
 if(effect==='finale'){
  if(round===1)specs.push({kind:'shape',count:2});
  if([3,5].includes(round))specs.push({kind:'quality',count:round===3?1:3});
 }
 if(effect==='apex'){
  if(round===1)specs.push({kind:'shape',category:true,slots:mark('focusSample',1)});
  if(round===2)specs.push({kind:'quality',slots:memory.focusSample||[]});
  if(round===4)specs.push({kind:'shape-quality',slots:sampleSlots(raw.filter(i=>!(memory.focusSample||[]).includes(i.slot)),2,rng)});
 }
 if(effect==='rare-count'){
  if(round===1)specs.push({kind:'stat',stat:'count',filter:{minQuality:3},scope:mark('rareSample',2)});
  if(round===3)specs.push({kind:'quality',slots:memory.rareSample||[]});
 }
 if(effect==='analyst'){
  if(round===1)specs.push({kind:'shape',slots:mark('valueSample',2).slice(0,1)});
  if(round===2&&memory.valueSample?.length)specs.push({kind:'stat',stat:'total',scope:memory.valueSample});
 }
 if(effect==='large-track'){
  if(round===1)memory.large=raw.slice().sort((a,b)=>b.w*b.h-a.w*a.h||a.slot-b.slot)[0]?.slot;
  if([1,2,4].includes(round))specs.push({kind:round===1?'shape':round===2?'quality':'identify',slots:[memory.large]});
  if(round===3)specs.push({kind:'quality',count:1});
 }
 if(effect==='fortune'&&[1,3,5].includes(round)){
  const n=Math.floor(rng()*4);memory.fortune=n;
  specs.push([{kind:'identify',count:1},{kind:'quality',count:1},{kind:'shape-quality',count:1},{kind:'shape',category:true,count:2}][n]);
 }
 return specs.map(sp=>apply(raw,intel,facts,sp,rng,scale)).filter(Boolean);
}
function bounds(items,facts,scale=1,pricingVersion=D.pricingVersion){
 const value=(item,scale)=>D.catalogPrice(item,scale,pricingVersion);
 const pools=items.map(candidates),n=items.length;let low=pools.reduce((s,p)=>s+Math.min(...p.map(i=>value(i,scale))),0),high=pools.reduce((s,p)=>s+Math.max(...p.map(i=>value(i,scale))),0);
 for(const f of facts){
  if(f.scope)continue;
  if(f.stat==='mean'&&!Object.keys(f.filter).length){low=Math.max(low,f.value*n);high=Math.min(high,(f.value+1)*n-1);}
  if(f.stat==='total'){
   low=Math.max(low,f.value+pools.reduce((s,p)=>s+(p.every(i=>!match(i,f.filter))?Math.min(...p.map(i=>value(i,scale))):0),0));
   high=Math.min(high,f.value+pools.reduce((s,p)=>s+Math.max(0,...p.filter(i=>!match(i,f.filter)).map(i=>value(i,scale))),0));
  }
  if(f.stat==='topValue'||f.stat==='largestValue')low=Math.max(low,f.value);
  if(f.stat==='count'||f.stat==='area'){
   const cap=f.stat==='area'?n*4:n;let lo=[0],hi=[0];
   for(const p of pools){const a=Array(cap+1).fill(Infinity),b=Array(cap+1).fill(-Infinity);
    for(let k=0;k<lo.length;k++)for(const i of p){const j=k+(match(i,f.filter)?(f.stat==='area'?i.w*i.h:1):0);if(j<=cap){a[j]=Math.min(a[j],lo[k]+value(i,scale));b[j]=Math.max(b[j],hi[k]+value(i,scale));}}
    lo=a;hi=b;
   }
   if(Number.isFinite(lo[f.value])){low=Math.max(low,lo[f.value]);high=Math.min(high,hi[f.value]);}
  }
 }
 // Scoped statistics constrain only the sampled slots, never the whole warehouse.
 const groups=new Map();for(const f of facts.filter(f=>f.scope)){const key=JSON.stringify([...f.scope].sort((a,b)=>a-b));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 for(const group of groups.values()){
  const scope=group[0].scope,inside=items.filter(i=>scope.includes(i.slot)),outside=items.filter(i=>!scope.includes(i.slot));
  const local=group.map(({scope,scopeGroup,...f})=>f),a=bounds(inside,local,scale,pricingVersion),b=bounds(outside,[],scale,pricingVersion);
  low=Math.max(low,a.low+b.low);high=Math.min(high,a.high+b.high);
 }
 return {low,high};
}
root.AuctionIntel=Object.freeze({empty,match,candidates,apply,skill,bounds});
})(globalThis);
