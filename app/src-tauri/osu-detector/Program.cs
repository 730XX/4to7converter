using System;
using System.Diagnostics;
using System.Text.Json;
using System.Threading;
using OsuMemoryDataProvider;

namespace osu_detector
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                var procs = Process.GetProcessesByName("osu!");
                if (procs.Length == 0)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { error = "Process.GetProcessesByName('osu!') returned 0 processes." }));
                    return;
                }

                var reader = new StructuredOsuMemoryReader();
                
                // Wait up to 2 seconds for reader to attach
                for (int i = 0; i < 20; i++)
                {
                    if (reader.CanRead) break;
                    Thread.Sleep(100);
                }

                if (!reader.CanRead)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { error = $"OsuMemoryReader attached failed. Proc ID: {procs[0].Id}, Admin? (Requires Admin if osu! is Admin)" }));
                    return;
                }

                reader.TryRead(reader.OsuMemoryAddresses.GeneralData);
                var status = reader.OsuMemoryAddresses.GeneralData.OsuStatus;

                reader.TryRead(reader.OsuMemoryAddresses.Beatmap);
                var folder = reader.OsuMemoryAddresses.Beatmap.FolderName;
                var file = reader.OsuMemoryAddresses.Beatmap.OsuFileName;

                var result = new
                {
                    folder_name = folder,
                    file_name = file,
                    status = status.ToString()
                };

                Console.WriteLine(JsonSerializer.Serialize(result));
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new { error = ex.Message }));
            }
        }
    }
}
