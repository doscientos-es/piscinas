-- Keep inventory filtering and pagination in Postgres so large catalogs never
-- need to be loaded into the browser just to render one page.
create or replace function public.list_inventory_page(
  p_query text default null,
  p_category text default null,
  p_status text default 'all',
  p_stock text default 'all',
  p_page integer default 1,
  p_page_size integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      nullif(btrim(p_query), '') as query,
      nullif(btrim(p_category), '') as category,
      coalesce(p_status, 'all') as status,
      coalesce(p_stock, 'all') as stock,
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 12), 1), 100) as page_size
  ), filtered as (
    select product.*
    from public.products as product
    cross join input
    where (input.query is null
      or product.name ilike '%' || input.query || '%'
      or coalesce(product.reference, '') ilike '%' || input.query || '%')
      and (input.category is null or product.category = input.category)
      and (input.status not in ('active', 'inactive')
        or product.active = (input.status = 'active'))
      and (input.stock not in ('low', 'healthy')
        or (input.stock = 'low' and product.active and product.stock_quantity <= product.minimum_stock)
        or (input.stock = 'healthy' and product.active and product.stock_quantity > product.minimum_stock))
  ), paged as (
    select filtered.*
    from filtered
    cross join input
    order by lower(filtered.name), filtered.id
    limit (select page_size from input)
    offset (select (page - 1) * page_size from input)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.list_inventory_page(text, text, text, text, integer, integer) from public;
revoke all on function public.list_inventory_page(text, text, text, text, integer, integer) from anon;
grant execute on function public.list_inventory_page(text, text, text, text, integer, integer) to authenticated;