-- "Your person" instead of "partner" in what people read (the data keeps
-- its names: is_partner, request_partner, ...). Only the error messages
-- these functions raise change; the rest of each definition is kept as is.

do $do$
declare
  fn text;
  def text;
  swaps text[][] := array[
    [$m$You don''t have a partner link$m$, $r$You''re not linked with your person$r$],
    [$m$One of you already has a partner$m$, $r$One of you is already linked with someone$r$],
    [$m$You can only partner with a connection$m$, $r$You can only link with a connection$r$],
    [$m$You already have a partner. End that link first.$m$, $r$You''re already linked with your person. Unlink first.$r$],
    [$m$They already have a partner$m$, $r$They''re already linked with someone$r$]
  ];
  i int;
begin
  foreach fn in array array['public.set_anniversary', 'public.respond_to_request', 'public.request_partner', 'public.end_partner'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p
    where p.oid = fn::regproc;
    for i in 1 .. array_length(swaps, 1) loop
      def := replace(def, swaps[i][1], swaps[i][2]);
    end loop;
    execute def;
  end loop;
end
$do$;
