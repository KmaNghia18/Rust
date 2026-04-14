use anyhow::Result;
use elasticsearch::{Elasticsearch, IndexParts, SearchParts, DeleteParts};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

// ─── Index Names ───────────────────────────────────────────────────────────
pub const INDEX_MESSAGES: &str = "discord_messages";
pub const INDEX_USERS:    &str = "discord_users";
pub const INDEX_GUILDS:   &str = "discord_guilds";
pub const INDEX_CHANNELS: &str = "discord_channels";

// ─── Indexed Document Shapes ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageDoc {
    pub id: String,
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub author_id: Uuid,
    pub author_username: String,
    pub content: String,
    pub timestamp: i64,
    pub has_attachments: bool,
    pub mention_everyone: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserDoc {
    pub id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GuildDoc {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub member_count: i64,
    pub icon_url: Option<String>,
}

// ─── Index Operations ──────────────────────────────────────────────────────

pub async fn index_message(es: &Elasticsearch, doc: &MessageDoc) -> Result<()> {
    es.index(IndexParts::IndexId(INDEX_MESSAGES, &doc.id))
        .body(doc)
        .send()
        .await?;
    Ok(())
}

pub async fn delete_message(es: &Elasticsearch, message_id: &str) -> Result<()> {
    es.delete(DeleteParts::IndexId(INDEX_MESSAGES, message_id))
        .send()
        .await?;
    Ok(())
}

pub async fn index_user(es: &Elasticsearch, doc: &UserDoc) -> Result<()> {
    es.index(IndexParts::IndexId(INDEX_USERS, &doc.id.to_string()))
        .body(doc)
        .send()
        .await?;
    Ok(())
}

pub async fn index_guild(es: &Elasticsearch, doc: &GuildDoc) -> Result<()> {
    es.index(IndexParts::IndexId(INDEX_GUILDS, &doc.id.to_string()))
        .body(doc)
        .send()
        .await?;
    Ok(())
}

// ─── Search Operations ─────────────────────────────────────────────────────

/// Full-text message search within a guild/channel
pub async fn search_messages(
    es: &Elasticsearch,
    query: &str,
    guild_id: Option<Uuid>,
    channel_id: Option<Uuid>,
    author_id: Option<Uuid>,
    has_attachments: Option<bool>,
    before: Option<i64>,
    after_ts: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<SearchResult<MessageDoc>> {
    let mut filters: Vec<Value> = vec![];

    if let Some(gid) = guild_id    { filters.push(json!({ "term": { "guild_id": gid } })); }
    if let Some(cid) = channel_id  { filters.push(json!({ "term": { "channel_id": cid } })); }
    if let Some(aid) = author_id   { filters.push(json!({ "term": { "author_id": aid } })); }
    if let Some(ha)  = has_attachments { filters.push(json!({ "term": { "has_attachments": ha } })); }
    if let Some(b)   = before      { filters.push(json!({ "range": { "timestamp": { "lt": b } } })); }
    if let Some(a)   = after_ts    { filters.push(json!({ "range": { "timestamp": { "gt": a } } })); }

    let body = json!({
        "query": {
            "bool": {
                "must": [{
                    "multi_match": {
                        "query": query,
                        "fields": ["content^3", "author_username"],
                        "type": "best_fields",
                        "fuzziness": "AUTO"
                    }
                }],
                "filter": filters
            }
        },
        "highlight": {
            "fields": {
                "content": {
                    "pre_tags":  ["<mark>"],
                    "post_tags": ["</mark>"],
                    "fragment_size": 150,
                    "number_of_fragments": 3
                }
            }
        },
        "sort": [{ "timestamp": { "order": "desc" } }],
        "from": offset,
        "size": limit
    });

    let response = es
        .search(SearchParts::Index(&[INDEX_MESSAGES]))
        .body(body)
        .send()
        .await?;

    parse_search_response::<MessageDoc>(response).await
}

/// Search public guilds by name/description
pub async fn search_guilds(
    es: &Elasticsearch,
    query: &str,
    limit: i64,
    offset: i64,
) -> Result<SearchResult<GuildDoc>> {
    let body = json!({
        "query": {
            "bool": {
                "must": [{
                    "multi_match": {
                        "query": query,
                        "fields": ["name^3", "description"],
                        "fuzziness": "AUTO"
                    }
                }],
                "filter": [{ "term": { "is_public": true } }]
            }
        },
        "sort": [{ "member_count": { "order": "desc" } }, "_score"],
        "from": offset,
        "size": limit
    });

    let response = es
        .search(SearchParts::Index(&[INDEX_GUILDS]))
        .body(body)
        .send()
        .await?;

    parse_search_response::<GuildDoc>(response).await
}

/// Search users by username/discriminator
pub async fn search_users(
    es: &Elasticsearch,
    query: &str,
    limit: i64,
) -> Result<SearchResult<UserDoc>> {
    let body = json!({
        "query": {
            "bool": {
                "should": [
                    { "match_phrase_prefix": { "username": { "query": query, "boost": 3 } } },
                    { "fuzzy": { "username": { "value": query, "fuzziness": 1 } } },
                    { "term": { "discriminator": { "value": query } } }
                ]
            }
        },
        "size": limit
    });

    let response = es
        .search(SearchParts::Index(&[INDEX_USERS]))
        .body(body)
        .send()
        .await?;

    parse_search_response::<UserDoc>(response).await
}

// ─── Bootstrap Index Mappings ──────────────────────────────────────────────

pub async fn ensure_indices(es: &Elasticsearch) -> Result<()> {
    create_index_if_missing(es, INDEX_MESSAGES, json!({
        "mappings": {
            "properties": {
                "id":               { "type": "keyword" },
                "channel_id":       { "type": "keyword" },
                "guild_id":         { "type": "keyword" },
                "author_id":        { "type": "keyword" },
                "author_username":  { "type": "text", "analyzer": "standard" },
                "content":          { "type": "text", "analyzer": "standard", "term_vector": "with_positions_offsets" },
                "timestamp":        { "type": "date", "format": "epoch_millis" },
                "has_attachments":  { "type": "boolean" },
                "mention_everyone": { "type": "boolean" }
            }
        },
        "settings": { "number_of_shards": 3, "number_of_replicas": 1 }
    })).await?;

    create_index_if_missing(es, INDEX_USERS, json!({
        "mappings": {
            "properties": {
                "id":            { "type": "keyword" },
                "username":      { "type": "text", "analyzer": "standard", "fields": { "keyword": { "type": "keyword" } } },
                "discriminator": { "type": "keyword" },
                "bio":           { "type": "text" },
                "avatar_url":    { "type": "keyword", "index": false }
            }
        }
    })).await?;

    create_index_if_missing(es, INDEX_GUILDS, json!({
        "mappings": {
            "properties": {
                "id":           { "type": "keyword" },
                "name":         { "type": "text", "analyzer": "standard", "fields": { "keyword": { "type": "keyword" } } },
                "description":  { "type": "text" },
                "is_public":    { "type": "boolean" },
                "member_count": { "type": "integer" },
                "icon_url":     { "type": "keyword", "index": false }
            }
        }
    })).await?;

    Ok(())
}

async fn create_index_if_missing(es: &Elasticsearch, index: &str, body: Value) -> Result<()> {
    use elasticsearch::indices::IndicesExistsParts;
    let exists = es.indices().exists(IndicesExistsParts::Index(&[index]))
        .send().await?.status_code().is_success();

    if !exists {
        use elasticsearch::indices::IndicesCreateParts;
        es.indices().create(IndicesCreateParts::Index(index))
            .body(body)
            .send()
            .await?;
        tracing::info!("Created Elasticsearch index: {}", index);
    }
    Ok(())
}

// ─── Response Parsing ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SearchResult<T> {
    pub total: i64,
    pub hits: Vec<SearchHit<T>>,
}

#[derive(Debug, Serialize)]
pub struct SearchHit<T> {
    pub score: Option<f64>,
    pub source: T,
    pub highlights: Option<Vec<String>>,
}

async fn parse_search_response<T: for<'de> Deserialize<'de>>(
    response: elasticsearch::http::response::Response,
) -> Result<SearchResult<T>> {
    let body: Value = response.json().await?;

    let total = body["hits"]["total"]["value"].as_i64().unwrap_or(0);
    let hits = body["hits"]["hits"]
        .as_array()
        .map(|arr| {
            arr.iter().filter_map(|hit| {
                let source: T = serde_json::from_value(hit["_source"].clone()).ok()?;
                let score = hit["_score"].as_f64();
                let highlights = hit["highlight"]["content"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|h| h.as_str().map(String::from)).collect());
                Some(SearchHit { score, source, highlights })
            }).collect()
        })
        .unwrap_or_default();

    Ok(SearchResult { total, hits })
}
