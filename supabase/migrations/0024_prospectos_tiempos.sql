-- Prospectos: la base anota sola los tiempos, para que el reporte no dependa de que alguien los capture.
--  · actualizado_en: cada cambio.
--  · primera_respuesta: la primera vez que el prospecto deja de estar "nuevo" (o la app la marca al abrir WhatsApp).
--  · calificado_en: la primera vez que llega a calificado, cotizado o ganado.
--  · atendido_por: quien hizo ese primer movimiento.
create or replace function app.prospectos_tiempos()
returns trigger language plpgsql set search_path = app, public as $$
begin
  new.actualizado_en := now();
  if new.primera_respuesta is null and new.estado <> 'nuevo' then
    new.primera_respuesta := now();
  end if;
  if new.calificado_en is null and new.estado in ('calificado','cotizado','ganado') then
    new.calificado_en := now();
  end if;
  if new.atendido_por is null and new.primera_respuesta is not null then
    new.atendido_por := auth.uid();
  end if;
  return new;
end $$;

create trigger prospectos_tiempos before update on app.prospectos
  for each row execute function app.prospectos_tiempos();
