# Rekonsiliasi Migration History Supabase

## Kesimpulan

Migration history lokal dan remote telah diselaraskan setelah schema remote
dibuktikan terlebih dahulu. Repair hanya menambahkan metadata history untuk
lima migration yang efek schema-nya sudah ada; tidak ada SQL migration lama
yang dijalankan ulang dan tidak ada tabel/data lama yang diubah oleh repair.

- Project ref: `baukcqccetzzwzgpbnoj`
- Kondisi awal remote history: kosong; schema
  `supabase_migrations` belum ada
- Kondisi akhir: lima versi lokal dan remote cocok

## Bukti Sebelum Repair

Audit read-only terhadap catalog PostgreSQL membuktikan objek utama dari lima
migration lokal sudah ada pada remote, termasuk:

- enum/kolom role canonical pada `profiles`;
- role `staff`;
- tabel serta fungsi modul visitor;
- trigger dan helper authorization yang menggantikan sebagian definisi lama;
- RLS dan policy terkait modul yang sudah dipublikasikan.

`supabase db pull --linked` tidak dapat dilanjutkan karena history lokal dan
remote berbeda. CLI menyarankan repair untuk lima versi lokal. Saran tersebut
tidak langsung diterima: schema, function, policy, grant, dan struktur profil
remote diaudit lebih dahulu melalui `sql/audit_june_remote_schema.sql` dan
`sql/audit_june_remote_security.sql`.

Backup sebelum repair juga mencatat bahwa schema migration history tidak ada.
Hal ini membuat keadaan awal dapat diaudit tanpa mengarang entry history.

## Versi yang Direkonsiliasi

Versi berikut ditandai `applied` setelah bukti schema diperiksa:

1. `20260722072548`
2. `20260722072609`
3. `20260724143000`
4. `20260724143100`
5. `20260724143200`

Perintah repair dijalankan secara eksplisit terhadap project linked yang sudah
diverifikasi. Setelahnya, `supabase migration list --linked` menampilkan kelima
versi tersebut pada sisi lokal dan remote.

## Drift dan Keputusan

Beberapa helper dari migration awal tidak lagi memiliki definisi persis seperti
file historis karena sudah digantikan oleh desain role/profil yang lebih baru.
Hal itu diperlakukan sebagai evolusi schema yang sudah terpublikasi, bukan
alasan untuk menjalankan ulang migration lama.

Audit juga menemukan kelemahan authorization pada schema remote: privilege
profil terlalu luas, dua policy update milik sendiri terlalu permisif, dan
trigger signup memberikan role admin aktif. Temuan tersebut tidak ditutupi
oleh history repair; perbaikannya dibuat sebagai migration additive baru yang
dapat diaudit.

Tidak ada `migration repair` yang dilakukan berdasarkan tebakan, dan file
migration historis yang sudah ada tidak diubah atau ditulis ulang.

