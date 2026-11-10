// 同梱する評価テキスト（src/input/text/corpus/）の原文と、そこから取る範囲。generate-eval-texts.tsが読む。
//
// 原文は取得元とsha256を固定する。青空文庫は作品のzip、Wikipediaは記事ごとの本文。
// どの記事・作品から、評価に渡す字数でどれだけ取るかもここに置く。

/** 分野別のテキストの目安の字数（既定の条件で評価に渡す字数）。 */
export const CATEGORY_TARGET_EVAL_CHARS = 10000;

/** 分野を混ぜたテキストで、出どころ（青空文庫の作品1つ・Wikipediaの分野1つ）ごとに取る字数。出どころは13。 */
export const MIXED_PER_SOURCE_EVAL_CHARS = Math.round(CATEGORY_TARGET_EVAL_CHARS / 13);

/** 分野を混ぜたテキストで、1つの出どころから取る塊の数。出どころを順に回って塊を並べる。 */
export const MIXED_CHUNKS_PER_SOURCE = 3;

/** 青空文庫の著作権が切れた作品。 */
export interface AozoraWork {
  /** `sampleId`。 */
  readonly id: string;
  /** 選択肢に出す分野の名前。 */
  readonly kind: string;
  readonly title: string;
  readonly author: string;
  /** 作者の没年。著作権の保護期間（没後70年）が切れていることの根拠として書く。 */
  readonly authorDeathYear: number;
  readonly cardUrl: string;
  readonly fileName: string;
  readonly url: string;
  readonly sha256: string;
  /** zipの中のテキスト。Shift_JIS */
  readonly entryName: string;
  /** 青空文庫のファイルの末尾にある底本・入力・校正の情報（要約）。 */
  readonly colophon: string;
}

export const AOZORA_WORKS: readonly AozoraWork[] = [
  {
    id: 'aozora-novel',
    kind: '小説',
    title: '人間失格',
    author: '太宰治',
    authorDeathYear: 1948,
    cardUrl: 'https://www.aozora.gr.jp/cards/000035/card301.html',
    fileName: '301_ruby_5915.zip',
    url: 'https://www.aozora.gr.jp/cards/000035/files/301_ruby_5915.zip',
    sha256: 'fb37d694f86687f9e84e26643804fa84b4346895f5f56a90dd8843a12e2bc9c8',
    entryName: 'ningen_shikkaku.txt',
    colophon: '底本：「人間失格」新潮文庫、新潮社、1952（昭和27）年10月30日発行、1985（昭和60）年1月30日100刷改版。入力：細渕真弓、校正：八巻美惠。',
  },
  {
    id: 'aozora-fairy-tale',
    kind: '童話',
    title: '銀河鉄道の夜',
    author: '宮沢賢治',
    authorDeathYear: 1933,
    cardUrl: 'https://www.aozora.gr.jp/cards/000081/card43737.html',
    fileName: '43737_ruby_19028.zip',
    url: 'https://www.aozora.gr.jp/cards/000081/files/43737_ruby_19028.zip',
    sha256: 'a1eede5175fe832269192e004d7893a06be8deb1c90e1683366a883c60e8a42a',
    entryName: 'gingatetsudono_yoru.txt',
    colophon:
      '底本：「銀河鉄道の夜」角川文庫、角川書店、1969（昭和44）年7月20日改版初版発行、1987（昭和62）年3月30日改版50版。入力：幸野素子、校正：土屋隆。',
  },
  {
    id: 'aozora-essay',
    kind: '随筆',
    title: '柿の種',
    author: '寺田寅彦',
    authorDeathYear: 1935,
    cardUrl: 'https://www.aozora.gr.jp/cards/000042/card1684.html',
    fileName: '1684_ruby_11273.zip',
    url: 'https://www.aozora.gr.jp/cards/000042/files/1684_ruby_11273.zip',
    sha256: 'ce6792f93e0b98a747b9dd452e4bdb8519b3439975bf68f06c9c605dae747c54',
    entryName: 'kakino_tane.txt',
    colophon: '底本：「柿の種」岩波文庫、岩波書店、1996（平成8）年4月16日第1刷発行、1997（平成9）年10月15日第9刷発行。入力：山口美佐、校正：田中敬三。',
  },
  {
    id: 'aozora-lecture',
    kind: '講演',
    title: '私の個人主義',
    author: '夏目漱石',
    authorDeathYear: 1916,
    cardUrl: 'https://www.aozora.gr.jp/cards/000148/card772.html',
    fileName: '772_ruby_33099.zip',
    url: 'https://www.aozora.gr.jp/cards/000148/files/772_ruby_33099.zip',
    sha256: '9508d8b1097dbb592d554c8c69f7891499582915f965a68e58b5541c085183e5',
    entryName: 'watashino_kojinshugi.txt',
    colophon: '底本：「ちくま日本文学全集　夏目漱石」筑摩書房、1992（平成4）年1月20日第1刷発行。入力：真先芳秋、校正：かとうかおり。',
  },
];

/** Wikipediaの記事。取得元のデータセットの1行で、本文は `sha256` で固定する。 */
export interface WikipediaArticle {
  readonly title: string;
  /** ja.wikipedia.orgのページID。取得した行と照合する。 */
  readonly pageId: number;
  /** データセットの `20231101.ja` の `train` の中での行の位置。 */
  readonly rowOffset: number;
  /** 取得した本文（UTF-8）のsha256。 */
  readonly sha256: string;
}

export interface WikipediaCategory {
  /** `sampleId`。 */
  readonly id: string;
  /** 選択肢に出す分野の名前。 */
  readonly name: string;
  /** 分野別のテキストは、記事を並べた順に、評価に渡す字数を均等に割って先頭から取る。分野を混ぜたテキストは、先頭の記事から順に、その続きを取る。 */
  readonly articles: readonly WikipediaArticle[];
}

/**
 * Wikipediaの本文の取得元。Hugging Faceのデータセット `wikimedia/wikipedia` の `20231101.ja`。
 * 本文はdatasets-serverの `rows` から行の位置を指定して取り、タイトルとページIDを照合してからsha256を照合する。
 */
export const WIKIPEDIA_SOURCE = {
  dataset: 'wikimedia/wikipedia',
  datasetUrl: 'https://huggingface.co/datasets/wikimedia/wikipedia',
  /** 固定したデータセットの版（Hugging Faceのコミット）。 */
  datasetRevision: 'b04c8d1ceb2f5cd4588862100d08de323dccfbaa',
  config: '20231101.ja',
  rowsUrl: 'https://datasets-server.huggingface.co/rows',
  /** 記事のページ。 */
  articleUrl: (title: string): string => `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  /** 記事の履歴のページ。執筆者の一覧を辿れる。 */
  historyUrl: (title: string): string => `https://ja.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=history`,
} as const;

export const WIKIPEDIA_CATEGORIES: readonly WikipediaCategory[] = [
  {
    id: 'wiki-science',
    name: '自然科学',
    articles: [
      { title: '光合成', pageId: 1860132, rowOffset: 607304, sha256: '01842499086d70c33dc87b20fa30ae8e371779e9e6ca4336dd7709f0aed3e938' },
      { title: '火山', pageId: 7693, rowOffset: 4893, sha256: '544175445815dc9174fb31d68d98fd2750b4656099f4f23b10f58c1f6a203535' },
      { title: '太陽', pageId: 544666, rowOffset: 214502, sha256: '4d1c57acc238d55480c7cbb082e9e34a6e62cfd90880a0c42d05244c4f921dd1' },
      { title: '進化', pageId: 14415, rowOffset: 8664, sha256: '09d4c1236529c06d9e88801c8bbadade53f16fff69510f4ed5163465c8a20281' },
      { title: '気象', pageId: 15961, rowOffset: 9655, sha256: 'd941b1816707ef730a90227c8c3bba318b88640658ca073fac4af6e74cdeaa4d' },
    ],
  },
  {
    id: 'wiki-technology',
    name: '技術',
    articles: [
      { title: '自動車', pageId: 2700, rowOffset: 1742, sha256: '8d085bc697258df20bea358151dfd335ee7269480c0de82d5454062895eb4d7b' },
      { title: '鉄道', pageId: 537, rowOffset: 236, sha256: '0e1961ed6487930f0c513ff91d7fe3c2c3d5bb633a4dc3392b0b845d5de01ab4' },
      { title: '飛行機', pageId: 5553, rowOffset: 3548, sha256: 'ddf6a5d961785003ff3cc3f717d8c830143f432dd46c0ec5df5757eb3e6537c3' },
      { title: 'インターネット', pageId: 539319, rowOffset: 212696, sha256: '5f5dae148a10884bd601ec122402cbb07932cc416e88aa8000076303b414979c' },
      { title: '半導体', pageId: 3676, rowOffset: 2355, sha256: 'ce153ac4792e2c98fb53159d841e4e1992e885b5137bdcc0f0bf3358a9b230ef' },
    ],
  },
  {
    id: 'wiki-japan-history',
    name: '日本史',
    articles: [
      { title: '江戸時代', pageId: 2740, rowOffset: 1763, sha256: '2e44a4c40eb60bf282dade1786be1b71d9137207a1ebe5e007777836230e0ab7' },
      { title: '明治維新', pageId: 4516, rowOffset: 2873, sha256: 'd12f0751e35c36df4df38ed81c3da04b3a5e45f8876b1eb8da6817c0a16b2c2a' },
      { title: '織田信長', pageId: 5697, rowOffset: 3656, sha256: '29888a0fa429c8b5e11eba2e419b2479d2466941962ff4d43f8b29312ad0961d' },
      { title: '鎌倉幕府', pageId: 8466, rowOffset: 5382, sha256: 'd1a8afb2737723597567ce68a0b534418ba0279c13314030b663f95015f979fa' },
      { title: '縄文時代', pageId: 823031, rowOffset: 302520, sha256: 'a5490716cf991058f9cdfdec9819de70842c9cde574ac63edbf445247b6ed696' },
    ],
  },
  {
    id: 'wiki-world-history',
    name: '世界史',
    articles: [
      { title: 'ローマ帝国', pageId: 7800, rowOffset: 4960, sha256: '2e1ae7c2b9d898458e4b27b3172d34c47542951df2d07e0b11c8967cb564455c' },
      { title: 'フランス革命', pageId: 556062, rowOffset: 218163, sha256: '9d6c19aac5099314574b8847869e2bb8db4761b6620da609c9fa117ebadfdc49' },
      { title: '産業革命', pageId: 82790, rowOffset: 45367, sha256: '12584a41f755ab98c6ef5d2684a884a37824d6ac199bdaf0e2c3bf90718e6a11' },
      { title: '第一次世界大戦', pageId: 5331, rowOffset: 3438, sha256: 'f329ae5ddff204d16d5b906acbc289f6fb534a951fd35e38d5469f5e4c5026f9' },
      { title: '大航海時代', pageId: 25200, rowOffset: 15118, sha256: '0982cd91ad18def5bf55132e28bcbab87a62f42310f3263d65052f5f047e4f70' },
    ],
  },
  {
    id: 'wiki-philosophy',
    name: '哲学',
    articles: [
      { title: '哲学', pageId: 110, rowOffset: 47, sha256: '356c7c9555844ace594f7505577486cbf2ab42456c5b995be40c7d6fa82a7ec5' },
      { title: '倫理学', pageId: 50426, rowOffset: 28316, sha256: 'f68b7e21b0f949753aa1733337c5554b35807ff43f1ba91d14a302b992299863' },
      { title: '功利主義', pageId: 29270, rowOffset: 17594, sha256: '23bd17c41fdaf27bb292e8b71b7014cd5175fe1c4f2895adb6228dd0baedaac1' },
      { title: 'イマヌエル・カント', pageId: 7113, rowOffset: 4555, sha256: 'bc3601f8a45bf3c25a2f9ebff54e8a439bf05feb78ad353ffd677ac9f74a29a9' },
      { title: '実存主義', pageId: 63365, rowOffset: 34711, sha256: 'c7eba15df86b4c43e3acc041467e4cc14ce4c926e77e6c05b19c6952b5d9bf09' },
    ],
  },
  {
    id: 'wiki-religion',
    name: '宗教',
    articles: [
      { title: '仏教', pageId: 4182, rowOffset: 2643, sha256: '105566a24e9f6fe86be183e0287ac1cd4829404ded831a56b7c0153114c59be3' },
      { title: 'キリスト教', pageId: 2016, rowOffset: 1288, sha256: '8cd04a1d2ce0b4a26348d56b02032948316c0483d401f7396a6f789fd4ab9520' },
      { title: '神道', pageId: 2759, rowOffset: 1777, sha256: 'dc21d02788abac34bb3a7ece161a34465f0a576ea3c41a14d6881da0017bd2ab' },
      { title: 'イスラム教', pageId: 571982, rowOffset: 223237, sha256: '0d48040bd4509f252019d5902b8e896e7658190c473cf455b1cb7f3457ef1e91' },
      { title: '浄土真宗', pageId: 4650, rowOffset: 2957, sha256: 'e5d8e674d2a179a487fc34709923f84c4fedd6f27d7f8f761a5bd486030e9f93' },
    ],
  },
  {
    id: 'wiki-language-arts',
    name: '言語と芸術',
    articles: [
      { title: '日本語', pageId: 11, rowOffset: 2, sha256: 'afe2d2ccedad24ceaed9ee9895ad73c33d781460d10c6f6e339251b108c3aa91' },
      { title: '漢字', pageId: 2794, rowOffset: 1796, sha256: '80414270da2d1449175fa047c11c640df640928b3448cbae244c527c946ae761' },
      { title: '俳句', pageId: 301255, rowOffset: 131722, sha256: '3a8023a0f6e078a4b78863f5d948012183d03e651847d92067ce35ce130c487d' },
      { title: '浮世絵', pageId: 12688, rowOffset: 7571, sha256: 'e9e4bd36aea3c765666df3a1983704181cb774ee61088bebbc143bd54cc5f62c' },
      { title: '歌舞伎', pageId: 1167852, rowOffset: 411247, sha256: '562698a046f8f2ecbd1f84801461918890b937a56b25d7d0125c92b3b80f86c2' },
    ],
  },
  {
    id: 'wiki-social-science',
    name: '社会科学',
    articles: [
      { title: '経済学', pageId: 1110, rowOffset: 638, sha256: '6c1df2c0dc0319f98bcb0687decae871a02dd4341e7ce049ce427e742cacb0fa' },
      { title: '民主主義', pageId: 9997, rowOffset: 6174, sha256: 'e19f9df8b5a0b1bd9721488d33c803fbc7732df54356167963ad661c1c8ccc83' },
      { title: '憲法', pageId: 7056, rowOffset: 4528, sha256: '646ac173336d533d8cceb60b90732ac5f8eb7345e43d12f3422f72c9fcfc4aa1' },
      { title: '貨幣', pageId: 21302, rowOffset: 12727, sha256: '16de6a3f7bcf43714d5329736900ba01ef672c806b8e48180175bb4731ad8812' },
      { title: '国際連合', pageId: 2395, rowOffset: 1535, sha256: 'b2151c40a48a40365865d88da7d6a8caae6eb2bdbb1550cb35ffe837674ee16f' },
    ],
  },
  {
    id: 'wiki-life-culture',
    name: '生活と文化',
    articles: [
      { title: '寿司', pageId: 254373, rowOffset: 115487, sha256: '35a9f42a13bf3125d195dd0e48e4cb6eb277b34d4a9b0114348aeba3d081624c' },
      { title: '日本料理', pageId: 5388, rowOffset: 3471, sha256: '3688a9755efd84274b436886652254f45e0a1faf73477c6d305f1c61006b1572' },
      { title: '温泉', pageId: 6771, rowOffset: 4326, sha256: '25010eebf8bc27280052bc5984b50f88a93d76b8dcd77da2f8fb908e86abf85c' },
      { title: '相撲', pageId: 1530, rowOffset: 941, sha256: '42f90721bdd4da5819b8f37b5829d6f375a6dc1502f7fa609537a730dc9524d5' },
      { title: '茶道', pageId: 443919, rowOffset: 182114, sha256: 'ff47ef430ba3c185104453c69cde8656ba35f4ebf11c5b87b58a38a77c431566' },
    ],
  },
];

/** 分野を混ぜたテキストの `sampleId` と名前。 */
export const MIXED_TEXT = { id: 'mixed', name: '混合（青空文庫4作品とWikipedia9分野）' } as const;
