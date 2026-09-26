-- Mensajes del pedido con el nombre de pila del autor: RLS impide al cliente leer
-- perfiles del personal. Solo el nombre, nada más de la persona.
create or replace function public.mensajes_del_pedido(_order_id uuid)
returns table (
  id uuid,
  kind text,
  body text,
  created_at timestamptz,
  read_at timestamptz,
  author_id uuid,
  autor text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.kind::text,
         m.body,
         m.created_at,
         m.read_at,
         m.author_id,
         nullif(trim(split_part(coalesce(p.first_name, ''), ' ', 1)), '') as autor
    from public.conversation_messages m
    left join public.profiles p on p.id = m.author_id
   where m.order_id = _order_id
     -- SECURITY DEFINER omite las políticas de conversation_messages: se repite la guarda.
     and exists (
       select 1 from public.orders o
        where o.id = m.order_id
          and (
            o.user_id = (select auth.uid())
            or public.is_staff()
            or (o.company_id is not null and o.company_id in (
                  select cm.company_id from public.company_members cm
                   where cm.user_id = (select auth.uid()) and cm.status = 'ACTIVO'
               ))
          )
     )
     -- Las notas internas nunca llegan al cliente.
     and m.kind <> 'NOTA_INTERNA'
   order by m.created_at;
$$;

revoke all on function public.mensajes_del_pedido(uuid) from public, anon;
grant execute on function public.mensajes_del_pedido(uuid) to authenticated;

notify pgrst, 'reload schema';
