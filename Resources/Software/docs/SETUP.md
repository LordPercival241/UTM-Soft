# UTM Lab · Puesta en marcha

1. Cree un proyecto de Supabase y verifique que el proveedor de autenticación por Correo (Email/Password) esté activo (habilitado por defecto en Supabase).
2. Ejecute `supabase/migrations/202609180001_initial.sql` en el editor SQL de Supabase (crea la tabla de perfiles de operadores). *Nota: Los datos y mediciones de ensayos no se guardan en la nube; se procesan en el navegador y se descargan localmente en PDF y CSV para preservar su cuota de Supabase.*
3. Copie `.env.example` como `.env.local` y complete las variables. `GEMINI_API_KEY` y `GEMINI_MODEL` se usan sólo en el servidor; no deben empezar con `NEXT_PUBLIC_`.
4. Instale dependencias con `npm install`, luego ejecute `npm run dev`.

## Keep-alive de Supabase (plan gratuito)

Supabase pausa automáticamente los proyectos del plan gratuito si no detecta actividad en la base de datos durante **7 días consecutivos**. Para evitar esto, el proyecto incluye:

- **`/api/cron/keep-alive`** — Endpoint GET que ejecuta una consulta mínima (`SELECT id FROM profiles LIMIT 1`) para reiniciar el contador de inactividad.
- **`vercel.json`** — Programa Vercel Cron para invocar el endpoint cada 5 días (`0 8 */5 * *`), dejando 2 días de margen.

### Configuración

1. **(Recomendado)** Genere un `CRON_SECRET` y agréguelo en Vercel → Settings → Environment Variables:
   ```bash
   openssl rand -base64 32
   ```
   Vercel Cron lo inyecta automáticamente como header `Authorization: Bearer <CRON_SECRET>`.
2. El cron usa `SUPABASE_SERVICE_ROLE_KEY` si está definida, o `NEXT_PUBLIC_SUPABASE_ANON_KEY` como respaldo. La anon key es suficiente para el ping.
3. Si no usa Vercel, puede llamar al endpoint desde cualquier servicio de cron externo (cron-job.org, UptimeRobot, GitHub Actions) cada ≤ 6 días:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://su-dominio.vercel.app/api/cron/keep-alive
   ```

## Protocolo serial v1

El firmware debe confirmar las órdenes con `ACK,id=<uuid>,status=OK`. La aplicación usa `HELLO`, `ARM_TEST`, `START_TEST` y `STOP_TEST`; el controlador decide si una orden es segura y puede rechazarla con `status=ERROR,reason=...`.

Cada muestra debe llegar en una única línea, con CRC-16/CCITT hexadecimal calculado sobre todo el contenido anterior a `,crc=`:

```text
SAMPLE,seq=42,t_ms=1200,force_raw=4567,displacement_raw=123,force_n=101.22,displacement_mm=0.42,crc=ABCD
```

Las muestras sin CRC válido se rechazan. Los saltos de secuencia se muestran y se guardan en el CSV como pérdida detectada. No se generan curvas de ejemplo.

## Límites de seguridad

- El navegador sólo solicita acciones; no es un controlador en tiempo real.
- El firmware debe detener el actuador ante paro de emergencia, finales de carrera, sobrecarga, error de sensor o pérdida de comunicación.
- Antes de aplicar carga real, valide el protocolo con banco de pruebas, la calibración de fuerza/desplazamiento y cada condición de parada.
