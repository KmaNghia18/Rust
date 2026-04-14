use anyhow::Result;
use elasticsearch::{
    http::transport::{SingleNodeConnectionPool, TransportBuilder},
    Elasticsearch,
};
use url::Url;

pub async fn build_client(elasticsearch_url: &str) -> Result<Elasticsearch> {
    let url = Url::parse(elasticsearch_url)?;
    let pool = SingleNodeConnectionPool::new(url);
    let transport = TransportBuilder::new(pool).disable_proxy().build()?;
    Ok(Elasticsearch::new(transport))
}
