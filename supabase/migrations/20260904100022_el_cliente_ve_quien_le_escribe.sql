-- Quién le está escribiendo al cliente.
--
-- La conversación del pedido mostraba «PINTUCO» en todos los mensajes del
-- equipo. No era una decisión: es que el cliente NO PUEDE leer el perfil de
-- otra persona —RLS se lo impide, y hace bien—, así que el nombre llegaba en
-- nulo y la pantalla caía a la marca.
--
-- El efecto es que quien compra no sabe con quién habla. En una conversación
-- de una tienda eso importa: «Yerson» responde por lo que dice; «Pintuco»,
-- nadie. Y si escriben dos personas distintas, el cliente no lo nota.
--
-- Se devuelve SOLO EL NOMBRE DE PILA, y solo de quien ha escrito en un pedido
-- que es del propio cliente. No el apellido, ni el correo, ni el teléfono: para
-- saludar a alguien basta su nombre, y de la plantilla del personal no tiene
-- por qué salir nada más.
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
     -- La misma puerta que ya protege la tabla: solo se ven los mensajes de un
     -- pedido que se puede ver. Al ser SECURITY DEFINER hay que repetirla aquí
     -- a mano, porque las políticas de `conversation_messages` no se aplican.
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
     -- Las notas internas no salen jamás hacia el cliente.
     and m.kind <> 'NOTA_INTERNA'
   order by m.created_at;
$$;

revoke all on function public.mensajes_del_pedido(uuid) from public, anon;
grant execute on function public.mensajes_del_pedido(uuid) to authenticated;

notify pgrst, 'reload schema';
