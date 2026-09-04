/* ============================================================
   Flow — host nativo.

   Una finestra WebView2 che monta la cartella app\ su un'origine
   interna (https://flow.example) e risponde da sé alle chiamate
   /api/*. Non apre socket, non ascolta su nessuna porta: le
   richieste sono intercettate dentro il processo e risolte
   leggendo e scrivendo su disco.

   La logica di archiviazione — scrittura atomica, backup a
   rotazione, salvataggio dei file illeggibili — è quella che
   stava in server.js, tradotta senza cambiamenti di comportamento.

   Compilato da build.cmd con il csc.exe incluso in Windows:
   nessun SDK, nessun pacchetto da installare.
   ============================================================ */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FlowApp
{
    /* ---------------------------------------------------------------- *
     * Percorsi e costanti
     * ---------------------------------------------------------------- */

    internal static class Paths
    {
        public const string VirtualHost = "flow.example";
        public const string StartUrl = "https://" + VirtualHost + "/index.html";

        public const int MaxBackups = 25;
        public const int MaxRescue = 5;
        public static readonly TimeSpan BackupEvery = TimeSpan.FromMinutes(5);

        public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        public static readonly string AppDir = Path.Combine(Root, "app");
        public static readonly string DataDir = Path.Combine(Root, "data");
        public static readonly string BackupDir = Path.Combine(DataDir, "backups");
        public static readonly string DataFile = Path.Combine(DataDir, "board.json");
        public static readonly string LogFile = Path.Combine(DataDir, "flow.log");
        public static readonly string WindowFile = Path.Combine(DataDir, ".window");
        public static readonly string IconFile = Path.Combine(AppDir, "flow.ico");

        public static void EnsureDirs()
        {
            if (!Directory.Exists(DataDir)) Directory.CreateDirectory(DataDir);
            if (!Directory.Exists(BackupDir)) Directory.CreateDirectory(BackupDir);
        }

        public static void Log(string message)
        {
            try
            {
                EnsureDirs();
                File.AppendAllText(LogFile,
                    DateTime.Now.ToString("s", CultureInfo.InvariantCulture) + " [flow] " + message + Environment.NewLine,
                    new UTF8Encoding(false));
            }
            catch (Exception) { }
        }
    }

    /* ---------------------------------------------------------------- *
     * Archiviazione — il vecchio server.js, senza HTTP
     * ---------------------------------------------------------------- */

    internal static class Storage
    {
        private static DateTime _lastBackup = DateTime.MinValue;

        /// <summary>La soglia dei backup riparte dal disco, non dalla memoria.</summary>
        public static void Init()
        {
            Paths.EnsureDirs();
            string[] files = ListBackups("board-");
            if (files.Length == 0) return;
            try { _lastBackup = File.GetLastWriteTime(files[files.Length - 1]); }
            catch (Exception) { }
        }

        private static string Stamp()
        {
            return DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
        }

        /// <summary>I nomi contengono la data: l'ordine alfabetico è anche cronologico.</summary>
        private static string[] ListBackups(string prefix)
        {
            try
            {
                string[] found = Directory.GetFiles(Paths.BackupDir, prefix + "*.json");
                Array.Sort(found, StringComparer.Ordinal);
                return found;
            }
            catch (Exception) { return new string[0]; }
        }

        /// <summary>Tiene solo gli ultimi `keep` file con quel prefisso.</summary>
        private static void TrimBackups(string prefix, int keep)
        {
            string[] files = ListBackups(prefix);
            for (int i = 0; i < files.Length - keep; i++)
            {
                try { File.Delete(files[i]); }
                catch (Exception) { break; }
            }
        }

        public static void BackupStats(out int count, out long bytes)
        {
            count = 0;
            bytes = 0;
            try
            {
                foreach (string f in Directory.GetFiles(Paths.BackupDir, "*.json"))
                {
                    count++;
                    bytes += new FileInfo(f).Length;
                }
            }
            catch (Exception) { }
        }

        /// <summary>
        /// Legge board.json così com'è: la validazione vera la fa il frontend.
        /// Se il file c'è ma non è un oggetto JSON non viene sovrascritto alla
        /// cieca — se ne mette una copia da parte e si riparte da un archivio nuovo.
        /// </summary>
        public static string Read()
        {
            if (!File.Exists(Paths.DataFile)) return null;

            string raw;
            try
            {
                raw = File.ReadAllText(Paths.DataFile, Encoding.UTF8);
            }
            catch (Exception err)
            {
                Paths.Log("board.json non leggibile: " + err.Message);
                Rescue();
                return null;
            }

            // Il BOM va tolto: un file salvato da Blocco note o PowerShell lo contiene.
            raw = raw.TrimStart('\uFEFF', ' ', '\t', '\r', '\n');   // il BOM che lascia Blocco note
            if (raw.Length == 0) return null;

            if (raw[0] != '{')
            {
                Paths.Log("board.json non contiene un oggetto JSON");
                Rescue();
                return null;
            }
            return raw;
        }

        private static void Rescue()
        {
            string target = Path.Combine(Paths.BackupDir, "illeggibile-" + Stamp() + ".json");
            try
            {
                Paths.EnsureDirs();
                File.Copy(Paths.DataFile, target, true);
                TrimBackups("illeggibile-", Paths.MaxRescue);
                Paths.Log("copia di emergenza salvata in " + target);
            }
            catch (Exception) { }
        }

        /// <summary>Scrittura atomica: file temporaneo + sostituzione.</summary>
        public static void Write(string json)
        {
            Paths.EnsureDirs();
            RotateBackup();

            string tmp = Paths.DataFile + ".tmp";
            File.WriteAllText(tmp, json, new UTF8Encoding(false));

            if (!File.Exists(Paths.DataFile))
            {
                File.Move(tmp, Paths.DataFile);
                return;
            }
            try
            {
                File.Replace(tmp, Paths.DataFile, null);
            }
            catch (IOException)
            {
                // Volumi diversi o file momentaneamente bloccato: ripiego non atomico.
                File.Delete(Paths.DataFile);
                File.Move(tmp, Paths.DataFile);
            }
        }

        private static void RotateBackup()
        {
            if (!File.Exists(Paths.DataFile)) return;

            DateTime now = DateTime.Now;
            if (now - _lastBackup < Paths.BackupEvery) return;
            _lastBackup = now;

            try
            {
                // Niente copie identiche: aprire e chiudere l'app senza modifiche
                // riempirebbe la cronologia di doppioni, buttando fuori quelle utili.
                string[] files = ListBackups("board-");
                if (files.Length > 0 && SameContent(files[files.Length - 1], Paths.DataFile)) return;

                File.Copy(Paths.DataFile, Path.Combine(Paths.BackupDir, "board-" + Stamp() + ".json"));
                TrimBackups("board-", Paths.MaxBackups);
            }
            catch (Exception err)
            {
                Paths.Log("backup non riuscito: " + err.Message);
            }
        }

        private static bool SameContent(string a, string b)
        {
            try
            {
                FileInfo fa = new FileInfo(a), fb = new FileInfo(b);
                if (fa.Length != fb.Length) return false;

                using (FileStream sa = fa.OpenRead())
                using (FileStream sb = fb.OpenRead())
                {
                    int x, y;
                    do
                    {
                        x = sa.ReadByte();
                        y = sb.ReadByte();
                        if (x != y) return false;
                    } while (x != -1);
                }
                return true;
            }
            catch (Exception) { return false; }
        }
    }

    /* ---------------------------------------------------------------- *
     * Piccolo aiuto per comporre JSON senza tirarsi dietro un parser
     * ---------------------------------------------------------------- */

    internal static class Json
    {
        public static string Str(string s)
        {
            if (s == null) return "null";
            StringBuilder sb = new StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }
    }

    /* ---------------------------------------------------------------- *
     * Selettore di cartelle in stile Esplora risorse
     *
     * FolderBrowserDialog e' la vecchia finestrella ad albero, e su .NET
     * Framework non ha modo di diventare quella moderna: OpenFileDialog si
     * aggiorna da se' (AutoUpgradeEnabled), lei no. La finestra moderna e'
     * IFileDialog con FOS_PICKFOLDERS, la stessa che apre l'Esplora risorse.
     * Qui sotto ci sono le sole due interfacce COM che servono per aprirla.
     *
     * ATTENZIONE: l'ordine delle dichiarazioni e' l'ordine della vtable. I
     * metodi che non chiamiamo restano come segnaposto e non vanno toccati,
     * o gli slot successivi slittano e si chiama la funzione sbagliata.
     * ---------------------------------------------------------------- */

    internal enum Picked { Scelta, Annullata, NonDisponibile }

    internal static class FolderPicker
    {
        private const uint PickFolders = 0x20;      // FOS_PICKFOLDERS
        private const uint ForceFilesystem = 0x40;  // FOS_FORCEFILESYSTEM
        private const uint PathMustExist = 0x800;   // FOS_PATHMUSTEXIST
        private const int SigdnFileSysPath = unchecked((int)0x80058000);
        private const int Cancelled = unchecked((int)0x800704C7);

        [ComImport, ClassInterface(ClassInterfaceType.None),
         Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
        private class FileOpenDialog { }

        [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"),
         InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileDialog
        {
            // IModalWindow
            [PreserveSig] int Show(IntPtr parent);
            // IFileDialog
            void SetFileTypes(uint count, IntPtr filters);
            void SetFileTypeIndex(uint index);
            void GetFileTypeIndex(out uint index);
            void Advise(IntPtr events, out uint cookie);
            void Unadvise(uint cookie);
            void SetOptions(uint options);
            void GetOptions(out uint options);
            void SetDefaultFolder(IShellItem item);
            void SetFolder(IShellItem item);
            void GetFolder(out IShellItem item);
            void GetCurrentSelection(out IShellItem item);
            void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
            void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
            void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
            void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
            void GetResult(out IShellItem item);
            // I metodi successivi (AddPlace, SetDefaultExtension, Close, …) non servono.
        }

        [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),
         InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellItem
        {
            void BindToHandler(IntPtr bc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
            void GetParent(out IShellItem parent);
            void GetDisplayName(int sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
            void GetAttributes(uint mask, out uint attributes);
            void Compare(IShellItem other, uint hint, out int order);
        }

        /// <summary>
        /// Apre la finestra moderna. <see cref="Picked.NonDisponibile"/> significa
        /// che il COM non ha risposto (sistema molto ridotto): chi chiama ripiega
        /// sulla finestra classica invece di lasciare l'utente senza selettore.
        /// </summary>
        public static Picked Show(IWin32Window owner, string title, out string path)
        {
            path = null;
            object com = null;
            try
            {
                com = new FileOpenDialog();
                IFileDialog dialog = (IFileDialog)com;

                uint options;
                dialog.GetOptions(out options);
                // FORCEFILESYSTEM tiene fuori le cartelle virtuali (Raccolte, Rete):
                // di quelle non esiste un percorso da salvare in board.json.
                dialog.SetOptions(options | PickFolders | ForceFilesystem | PathMustExist);
                if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);

                int hr = dialog.Show(owner == null ? IntPtr.Zero : owner.Handle);
                if (hr == Cancelled) return Picked.Annullata;
                if (hr != 0) return Picked.NonDisponibile;

                IShellItem item;
                dialog.GetResult(out item);
                try { item.GetDisplayName(SigdnFileSysPath, out path); }
                finally { Marshal.ReleaseComObject(item); }

                return string.IsNullOrEmpty(path) ? Picked.Annullata : Picked.Scelta;
            }
            catch (Exception err)
            {
                Paths.Log("selettore moderno non disponibile: " + err.Message);
                return Picked.NonDisponibile;
            }
            finally
            {
                if (com != null) Marshal.ReleaseComObject(com);
            }
        }
    }

    /* ---------------------------------------------------------------- *
     * La finestra
     * ---------------------------------------------------------------- */

    internal sealed class FlowForm : Form
    {
        private readonly WebView2 _web = new WebView2();
        private CoreWebView2 _core;

        /// <summary>La chiusura viene rimandata finché la pagina non ha consegnato lo stato.</summary>
        private bool _flushed;
        private Timer _closeGuard;

        // Riconosce una struttura plausibile senza dover interpretare tutto il JSON:
        // è la stessa difesa che faceva server.js prima di scrivere.
        private static readonly Regex HasTasks = new Regex("\"tasks\"\\s*:\\s*\\[", RegexOptions.Compiled);
        private static readonly Regex HasProjects = new Regex("\"projects\"\\s*:\\s*\\[", RegexOptions.Compiled);

        public FlowForm()
        {
            Text = "Flow";
            BackColor = Color.FromArgb(17, 18, 23);
            MinimumSize = new Size(760, 520);
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(1440, 900);

            if (File.Exists(Paths.IconFile))
            {
                try { Icon = new Icon(Paths.IconFile); }
                catch (Exception) { }
            }

            RestoreWindow();

            _web.Dock = DockStyle.Fill;
            _web.DefaultBackgroundColor = Color.FromArgb(17, 18, 23);
            Controls.Add(_web);

            Load += OnLoad;
            FormClosing += OnFormClosing;
        }

        /* ------------------------- avvio del motore ------------------------- */

        private async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, UserDataFolder(), null);
                await _web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(
                    "Non ho trovato il runtime WebView2.\r\n\r\n" +
                    "Di norma è già incluso in Windows 10 e 11 insieme a Microsoft Edge.\r\n" +
                    "Se manca, si installa da:\r\n" +
                    "https://developer.microsoft.com/microsoft-edge/webview2/",
                    "Flow", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Close();
                return;
            }
            catch (Exception err)
            {
                Paths.Log("avvio non riuscito: " + err);
                MessageBox.Show("Flow non è riuscito ad avviarsi.\r\n\r\n" + err.Message +
                    "\r\n\r\nDettagli in: data\\flow.log", "Flow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            _core = _web.CoreWebView2;

            _core.Settings.AreDefaultContextMenusEnabled = false;  // l'app ha i suoi menu
            _core.Settings.IsStatusBarEnabled = false;
            _core.Settings.IsZoomControlEnabled = false;
            _core.Settings.IsSwipeNavigationEnabled = false;
            _core.Settings.AreDevToolsEnabled = true;              // F12 resta utile

            // Tutto passa di qui: pagina, script, stili e API. La cartella app\ e
            // l'archivio su disco rispondono da dentro il processo, senza rete.
            //
            // Non si usa SetVirtualHostNameToFolderMapping: quella mappatura serve
            // i file da sé e scavalca WebResourceRequested, quindi le chiamate a
            // /api/* non arriverebbero mai fin qui.
            _core.AddWebResourceRequestedFilter(
                "https://" + Paths.VirtualHost + "/*", CoreWebView2WebResourceContext.All);
            _core.WebResourceRequested += OnResourceRequested;

            _core.WebMessageReceived += OnWebMessage;
            _core.NewWindowRequested += OnNewWindow;
            _core.WindowCloseRequested += delegate { Close(); };

            _core.NavigationCompleted += delegate(object s2, CoreWebView2NavigationCompletedEventArgs a)
            {
                Paths.Log("navigazione: " + (a.IsSuccess ? "ok" : "FALLITA " + a.WebErrorStatus));
            };
            _core.ProcessFailed += delegate(object s2, CoreWebView2ProcessFailedEventArgs a)
            {
                Paths.Log("motore in errore: " + a.ProcessFailedKind);
            };
            // Gli errori di script finiscono in data\flow.log: senza barra del
            // browser sotto mano, è l'unico modo per accorgersene.
            await _core.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.addEventListener('error',function(e){try{chrome.webview.postMessage(" +
                "'flow:err:'+e.message+' @ '+e.filename+':'+e.lineno)}catch(x){}});");

            _core.Navigate(Paths.StartUrl);
            Paths.Log("avviata — archivio: " + Paths.DataFile);
        }

        /// <summary>
        /// La cache del motore sta nella cartella, così l'insieme resta portabile.
        /// Se la cartella non è scrivibile (chiavetta protetta, percorso di sistema)
        /// si ripiega sul profilo utente invece di non partire.
        /// </summary>
        private static string UserDataFolder()
        {
            string local = Path.Combine(Paths.DataDir, ".webview2");
            try
            {
                Directory.CreateDirectory(local);
                string probe = Path.Combine(local, ".prova");
                File.WriteAllText(probe, "");
                File.Delete(probe);
                return local;
            }
            catch (Exception)
            {
                string fallback = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Flow");
                Directory.CreateDirectory(fallback);
                Paths.Log("cartella non scrivibile, uso " + fallback);
                return fallback;
            }
        }

        /* ------------------------- le API, senza rete ------------------------- */

        private void OnResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            string path;
            try { path = new Uri(e.Request.Uri).AbsolutePath; }
            catch (Exception) { return; }

            if (!path.StartsWith("/api/", StringComparison.Ordinal))
            {
                ServeStatic(e, path);
                return;
            }

            string method = (e.Request.Method ?? "GET").ToUpperInvariant();

            try
            {
                switch (path)
                {
                    case "/api/data":
                        if (method == "GET") { Reply(e, 200, Storage.Read() ?? "{}"); return; }
                        if (method == "PUT" || method == "POST") { SaveFromRequest(e); return; }
                        Reply(e, 405, "{\"error\":\"metodo non ammesso\"}");
                        return;

                    case "/api/info":
                        {
                            int count;
                            long bytes;
                            Storage.BackupStats(out count, out bytes);
                            Reply(e, 200, "{" +
                                "\"file\":" + Json.Str(Paths.DataFile) + "," +
                                "\"dir\":" + Json.Str(Paths.DataDir) + "," +
                                "\"backups\":" + count.ToString(CultureInfo.InvariantCulture) + "," +
                                "\"backupBytes\":" + bytes.ToString(CultureInfo.InvariantCulture) + "," +
                                "\"maxBackups\":" + Paths.MaxBackups.ToString(CultureInfo.InvariantCulture) + "," +
                                "\"host\":" + Json.Str("WebView2 " + CoreWebView2Environment.GetAvailableBrowserVersionString()) +
                                "}");
                            return;
                        }

                    case "/api/reveal":
                        {
                            string target = File.Exists(Paths.DataFile) ? Paths.DataFile : Paths.DataDir;
                            try { Process.Start("explorer.exe", "/select,\"" + target + "\""); }
                            catch (Exception) { }
                            Reply(e, 200, "{\"ok\":true}");
                            return;
                        }

                    case "/api/pick":
                        {
                            if (method != "POST") { Reply(e, 405, "{\"error\":\"metodo non ammesso\"}"); return; }
                            PickFromRequest(e, ReadBody(e).Trim());
                            return;
                        }

                    case "/api/open":
                        {
                            if (method != "POST") { Reply(e, 405, "{\"error\":\"metodo non ammesso\"}"); return; }
                            string problem;
                            if (Reveal(ReadBody(e), out problem)) Reply(e, 200, "{\"ok\":true}");
                            else Reply(e, 404, "{\"error\":" + Json.Str(problem) + "}");
                            return;
                        }

                    case "/api/kind":
                        {
                            if (method != "POST") { Reply(e, 405, "{\"error\":\"metodo non ammesso\"}"); return; }
                            KindFromRequest(e, ReadBody(e));
                            return;
                        }

                    case "/api/quit":
                        Reply(e, 200, "{\"ok\":true}");
                        BeginInvoke((MethodInvoker)delegate { Close(); });
                        return;

                    case "/api/health":
                    case "/api/ping":
                        Reply(e, 200, "{\"ok\":true}");
                        return;

                    default:
                        Reply(e, 404, "{\"error\":\"endpoint sconosciuto\"}");
                        return;
                }
            }
            catch (Exception err)
            {
                Paths.Log("errore su " + path + ": " + err);
                Reply(e, 500, "{\"error\":" + Json.Str(err.Message) + "}");
            }
        }

        private static string ReadBody(CoreWebView2WebResourceRequestedEventArgs e)
        {
            Stream content = e.Request.Content;
            if (content == null) return "";
            using (StreamReader reader = new StreamReader(content, new UTF8Encoding(false)))
                return reader.ReadToEnd();
        }

        private void SaveFromRequest(CoreWebView2WebResourceRequestedEventArgs e)
        {
            string body = ReadBody(e);

            if (!Accepts(body))
            {
                Reply(e, 400, "{\"error\":\"struttura inattesa\"}");
                return;
            }

            Storage.Write(body);
            Reply(e, 200, "{\"ok\":true,\"bytes\":" +
                Encoding.UTF8.GetByteCount(body).ToString(CultureInfo.InvariantCulture) + "}");
        }

        /* ------------------------- collegamenti a cartelle e file -------------------------
           Tre endpoint per la scheda Note dei progetti: /api/pick (selettore),
           /api/kind (cartella o file?) e /api/open (mostra nell'Esplora risorse).
           Il corpo della richiesta e' il percorso (o "dir"/"file") in chiaro, non un
           oggetto JSON: qui non c'e' un interprete JSON, e scriverne uno per una
           stringa sola non ha senso. */

        /// <summary>
        /// Apre il selettore nativo di Windows. La risposta arriva a scelta
        /// effettuata, quindi la richiesta viene messa in attesa con un deferral:
        /// una finestra modale non si puo' aprire dentro il gestore dell'evento.
        /// </summary>
        private void PickFromRequest(CoreWebView2WebResourceRequestedEventArgs e, string kind)
        {
            CoreWebView2Deferral deferral = e.GetDeferral();
            BeginInvoke((MethodInvoker)delegate
            {
                string json = "{\"cancelled\":true}";
                try { json = Pick(kind); }
                catch (Exception err) { Paths.Log("selettore non riuscito: " + err.Message); }
                try { Reply(e, 200, json); }
                catch (Exception err) { Paths.Log("risposta al selettore non riuscita: " + err.Message); }
                finally { deferral.Complete(); }
            });
        }

        private string Pick(string kind)
        {
            if (kind == "file")
            {
                using (OpenFileDialog dialog = new OpenFileDialog())
                {
                    dialog.Title = "Scegli un file da collegare";
                    dialog.CheckFileExists = true;
                    dialog.Multiselect = false;
                    dialog.Filter = "Tutti i file (*.*)|*.*";
                    if (dialog.ShowDialog(this) != DialogResult.OK) return "{\"cancelled\":true}";
                    return "{\"path\":" + Json.Str(dialog.FileName) + "}";
                }
            }

            string folder;
            Picked outcome = FolderPicker.Show(this, "Scegli una cartella da collegare", out folder);
            if (outcome == Picked.Scelta) return "{\"path\":" + Json.Str(folder) + "}";
            if (outcome == Picked.Annullata) return "{\"cancelled\":true}";

            // Ripiego sulla finestra classica: brutta, ma meglio di nessun selettore.
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Scegli una cartella da collegare";
                dialog.ShowNewFolderButton = false;
                if (dialog.ShowDialog(this) != DialogResult.OK) return "{\"cancelled\":true}";
                return "{\"path\":" + Json.Str(dialog.SelectedPath) + "}";
            }
        }

        /// <summary>
        /// Guarda il disco e dice se il percorso e' una cartella o un file.
        /// Serve alla finestra dei collegamenti per mettere il tipo da se':
        /// l'estensione da sola sbaglia sia in un verso (una cartella chiamata
        /// "versione 1.2") sia nell'altro (un file senza estensione).
        /// Guarda e risponde: non apre e non scrive niente.
        /// </summary>
        private void KindFromRequest(CoreWebView2WebResourceRequestedEventArgs e, string raw)
        {
            // Interrogare il disco puo' volerci tempo — una cartella di rete
            // che non risponde ci mette secondi — e qui si e' sul filo della
            // finestra: la risposta si mette in attesa e la verifica va altrove.
            CoreWebView2Deferral deferral = e.GetDeferral();
            // Nome per esteso: un "using System.Threading" renderebbe ambiguo
            // Timer, che qui e' quello di WinForms.
            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                string json = KindOf(raw);
                try
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        try { Reply(e, 200, json); }
                        catch (Exception err) { Paths.Log("risposta sul tipo non riuscita: " + err.Message); }
                        finally { deferral.Complete(); }
                    });
                }
                catch (Exception)
                {
                    // Finestra gia' chiusa: non c'e' piu' nessuno che aspetta.
                    try { deferral.Complete(); }
                    catch (Exception) { }
                }
            });
        }

        private static string KindOf(string raw)
        {
            // Le virgolette arrivano da "Copia come percorso" dell'Esplora
            // risorse, che incolla il percorso fra apici.
            string wanted = (raw ?? "").Trim().Trim('"');
            if (wanted.Length == 0) return "{\"exists\":false}";

            string full;
            try
            {
                if (!Path.IsPathRooted(wanted)) return "{\"exists\":false}";
                full = Path.GetFullPath(wanted);
            }
            catch (Exception) { return "{\"exists\":false}"; }

            try
            {
                if (Directory.Exists(full)) return "{\"exists\":true,\"kind\":\"dir\"}";
                if (File.Exists(full)) return "{\"exists\":true,\"kind\":\"file\"}";
            }
            catch (Exception) { }
            // Non esiste, o non si ha il permesso di guardare: decide chi ha
            // chiesto, in base all'estensione.
            return "{\"exists\":false}";
        }

        /// <summary>
        /// Mostra un percorso nell'Esplora risorse. <b>Non esegue mai niente:</b>
        /// un file viene solo evidenziato dentro la sua cartella, mai avviato.
        /// Accetta unicamente percorsi assoluti che esistono davvero.
        /// </summary>
        private static bool Reveal(string raw, out string problem)
        {
            problem = null;
            string wanted = (raw ?? "").Trim().Trim('"');
            if (wanted.Length == 0) { problem = "percorso vuoto"; return false; }

            string full;
            try
            {
                // Un percorso relativo si risolverebbe sulla cartella di lavoro del
                // processo: non e' mai quello che intendeva chi ha salvato il link.
                if (!Path.IsPathRooted(wanted)) { problem = "serve un percorso assoluto"; return false; }
                full = Path.GetFullPath(wanted);
            }
            catch (Exception) { problem = "percorso non valido"; return false; }

            bool isDir = Directory.Exists(full);
            bool isFile = !isDir && File.Exists(full);
            if (!isDir && !isFile) { problem = "percorso inesistente"; return false; }

            ProcessStartInfo psi = new ProcessStartInfo();
            // Percorso pieno e non "explorer.exe": senza shell la ricerca
            // dipenderebbe dal PATH del processo.
            psi.FileName = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            // Una cartella si apre mostrandone il contenuto: "/select," sul suo
            // percorso aprirebbe il livello superiore con la cartella evidenziata.
            psi.Arguments = isDir ? "\"" + full + "\"" : "/select,\"" + full + "\"";
            psi.UseShellExecute = false;   // la stringa non passa da nessuna shell
            try { Process.Start(psi); }
            catch (Exception err) { problem = err.Message; return false; }
            return true;
        }

        /// <summary>Non si scrive sul disco qualcosa che non somiglia a un archivio.</summary>
        private static bool Accepts(string body)
        {
            if (string.IsNullOrEmpty(body)) return false;
            string trimmed = body.TrimStart();
            if (trimmed.Length == 0 || trimmed[0] != '{') return false;
            return HasTasks.IsMatch(body) && HasProjects.IsMatch(body);
        }

        private void Reply(CoreWebView2WebResourceRequestedEventArgs e, int code, string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            e.Response = _core.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), code, code == 200 ? "OK" : "Error",
                "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store");
        }

        /* ------------------------- i file della cartella app\ ------------------------- */

        private static readonly Dictionary<string, string> Mime =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html",  "text/html; charset=utf-8" },
            { ".css",   "text/css; charset=utf-8" },
            { ".js",    "text/javascript; charset=utf-8" },
            { ".json",  "application/json; charset=utf-8" },
            { ".svg",   "image/svg+xml" },
            { ".png",   "image/png" },
            { ".jpg",   "image/jpeg" },
            { ".webp",  "image/webp" },
            { ".ico",   "image/x-icon" },
            { ".woff2", "font/woff2" },
            { ".woff",  "font/woff" }
        };

        private void ServeStatic(CoreWebView2WebResourceRequestedEventArgs e, string path)
        {
            if (path == "/" || path.Length == 0) path = "/index.html";

            string full;
            try
            {
                string rel = Uri.UnescapeDataString(path).TrimStart('/').Replace('/', '\\');
                full = Path.GetFullPath(Path.Combine(Paths.AppDir, rel));
            }
            catch (Exception)
            {
                NotFound(e);
                return;
            }

            // Un percorso con .. non deve poter uscire da app\.
            if (!full.StartsWith(Paths.AppDir + "\\", StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            {
                Paths.Log("non trovato: " + path);
                NotFound(e);
                return;
            }

            string type;
            if (!Mime.TryGetValue(Path.GetExtension(full), out type)) type = "application/octet-stream";

            byte[] bytes = File.ReadAllBytes(full);
            e.Response = _core.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), 200, "OK",
                "Content-Type: " + type + "\r\nCache-Control: no-cache");
        }

        private void NotFound(CoreWebView2WebResourceRequestedEventArgs e)
        {
            e.Response = _core.Environment.CreateWebResourceResponse(
                new MemoryStream(Encoding.UTF8.GetBytes("Non trovato")), 404, "Not Found",
                "Content-Type: text/plain; charset=utf-8");
        }

        /* ------------------------- navigazione esterna ------------------------- */

        private void OnNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;   // niente finestre di browser che spuntano dall'app
            try
            {
                Uri u = new Uri(e.Uri);
                if (u.Scheme == "http" || u.Scheme == "https")
                {
                    if (u.Host != Paths.VirtualHost) Process.Start(e.Uri);
                }
            }
            catch (Exception) { }
        }

        /* ------------------------- chiusura senza perdite ------------------------- */

        /// <summary>
        /// Il salvataggio automatico scatta mezzo secondo dopo l'ultima modifica:
        /// chiudendo subito dopo un ritocco, quel mezzo secondo andrebbe perso.
        /// La chiusura viene quindi rimandata finché la pagina non ha consegnato
        /// lo stato — e comunque non oltre un secondo e mezzo.
        /// </summary>
        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (_flushed || _core == null) { SaveWindow(); return; }

            e.Cancel = true;

            _closeGuard = new Timer();
            _closeGuard.Interval = 1500;
            _closeGuard.Tick += delegate
            {
                _closeGuard.Stop();
                ForceClose();
            };
            _closeGuard.Start();

            _core.ExecuteScriptAsync(
                "(function(){try{" +
                "if(window.Store&&Store.state)" +
                "chrome.webview.postMessage('flow:save:'+JSON.stringify(Store.state,null,2));" +
                "else chrome.webview.postMessage('flow:save:');" +
                "}catch(err){chrome.webview.postMessage('flow:save:');}})()");
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string message;
            try { message = e.TryGetWebMessageAsString(); }
            catch (Exception) { return; }

            if (message != null && message.StartsWith("flow:err:", StringComparison.Ordinal))
            {
                Paths.Log("errore nella pagina: " + message.Substring("flow:err:".Length));
                return;
            }

            if (message == null || !message.StartsWith("flow:save:", StringComparison.Ordinal)) return;

            string body = message.Substring("flow:save:".Length);
            if (Accepts(body))
            {
                try { Storage.Write(body); }
                catch (Exception err) { Paths.Log("salvataggio finale non riuscito: " + err.Message); }
            }
            ForceClose();
        }

        private void ForceClose()
        {
            if (_flushed) return;
            _flushed = true;
            if (_closeGuard != null) _closeGuard.Stop();
            Close();   // rientra in OnFormClosing, che ora lascia passare e salva la posizione
        }

        /* ------------------------- posizione della finestra ------------------------- */

        private void RestoreWindow()
        {
            try
            {
                if (!File.Exists(Paths.WindowFile)) return;
                string[] p = File.ReadAllText(Paths.WindowFile).Split(',');
                if (p.Length < 5) return;

                int x = int.Parse(p[0], CultureInfo.InvariantCulture);
                int y = int.Parse(p[1], CultureInfo.InvariantCulture);
                int w = int.Parse(p[2], CultureInfo.InvariantCulture);
                int h = int.Parse(p[3], CultureInfo.InvariantCulture);

                Rectangle wanted = new Rectangle(x, y, w, h);
                // Uno schermo scollegato lascerebbe la finestra fuori dal visibile.
                bool visible = false;
                foreach (Screen s in Screen.AllScreens)
                    if (s.WorkingArea.IntersectsWith(wanted)) visible = true;

                if (visible && w >= MinimumSize.Width && h >= MinimumSize.Height)
                {
                    StartPosition = FormStartPosition.Manual;
                    Bounds = wanted;
                }
                if (p[4] == "1") WindowState = FormWindowState.Maximized;
            }
            catch (Exception) { }
        }

        private void SaveWindow()
        {
            try
            {
                Rectangle b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                Paths.EnsureDirs();
                File.WriteAllText(Paths.WindowFile, string.Join(",", new string[] {
                    b.X.ToString(CultureInfo.InvariantCulture),
                    b.Y.ToString(CultureInfo.InvariantCulture),
                    b.Width.ToString(CultureInfo.InvariantCulture),
                    b.Height.ToString(CultureInfo.InvariantCulture),
                    WindowState == FormWindowState.Maximized ? "1" : "0"
                }));
            }
            catch (Exception) { }
        }
    }

    /* ---------------------------------------------------------------- *
     * Avvio
     * ---------------------------------------------------------------- */

    internal static class Program
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string path);

        [STAThread]
        private static void Main()
        {
            // WebView2Loader.dll sta in lib\ insieme al resto: va indicato al caricatore.
            try { SetDllDirectory(Path.Combine(Paths.Root, "lib")); }
            catch (Exception) { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (!Directory.Exists(Paths.AppDir))
            {
                MessageBox.Show(
                    "Manca la cartella app\\ accanto a Flow.exe.\r\n\r\n" +
                    "Flow va tenuto insieme alla sua cartella: spostali sempre entrambi.",
                    "Flow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Storage.Init();
            Application.Run(new FlowForm());
        }
    }
}
