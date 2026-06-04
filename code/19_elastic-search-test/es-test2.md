# 分词器操作

ElasticSearch 中的默认分词器是 Standard，该分词器主要是为英文等西方语言设计的，对中文分词时不太友好，比如：

```yaml

# 处理英文
"Hello World" -> ["Hello", "World"]

# 处理中文
"我爱中国" -> ["我", "爱", "中", "国"]
```

IK 分词器专门针对中文设计，内置海量的中文词典，能够根据词义进行智能拆分。它提供了两种分词模式：`ik_smart` 和 `ik_max_word`：

- `ik_smart`（智能分词/粗粒度）：切分粒度相对较粗，适合快速检索；

```yaml

"中华人民共和国国歌" -> ["中华人民共和国", "国歌"]
```

- `ik_max_word`（最细分词/细粒度）：切分粒度最细，能够识别尽可能多的词语，适合深度分析。

```yaml

"中华人民共和国国歌" -> ["中华人民共和国", "中华人民", "中华", "华人", "人民共和国", "人民", "共和国", "国歌"]
```

使用场景：`ik_max_word` 用于数据写入（建立索引），把内容尽可能 ”拆碎“ 存入；`ik_smart` 用于搜索查询，根据核心词去匹配，提高搜索性能和准确度。

除了以上分词器，还有 `HanLP( 高精度与复杂语义 )`、`THULAC`、`jieba 分词`、`Pinyin 分词器( 拼音搜索 )`、`SmartCN( es官方自带 )` 等分词器。

---

1. 分词操作

```yaml

# 1. 检查 ES 状态
GET /

# 2. 查看已安装插件
GET /_cat/plugins?v

# 3. 原生 standard 分词
POST /_analyze
{
"analyzer": "standard",
"text": "Elasticsearch RAG 混合检索知识库"
}

# 4. IK 细粒度分词（索引入库用）
POST /_analyze
{
"analyzer": "ik_max_word",
"text": "Elasticsearch RAG 混合检索知识库"
}

# 5. IK 智能分词（搜索查询用）
POST /_analyze
{
"analyzer": "ik_smart",
"text": "Elasticsearch RAG 混合检索知识库"
}
```
