using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace CopilotWebApp.Services;

/// <summary>
/// Azure Blob Storage からワークフロー出力ファイルを取得するサービス。
/// Blob は runs/{run_number}/ プレフィックスで整理されている前提。
/// </summary>
public class BlobStorageService
{
    private readonly BlobContainerClient _container;
    private readonly ILogger<BlobStorageService> _logger;

    public BlobStorageService(IConfiguration config, ILogger<BlobStorageService> logger)
    {
        _logger = logger;

        var connectionString = config["AzureStorage:ConnectionString"]
            ?? throw new ArgumentException("AzureStorage:ConnectionString is required");
        var containerName = config["AzureStorage:ContainerName"] ?? "copilot-outputs";

        var serviceClient = new BlobServiceClient(connectionString);
        _container = serviceClient.GetBlobContainerClient(containerName);
    }

    /// <summary>
    /// 指定した run_number のファイル一覧を取得する。
    /// </summary>
    public async Task<List<BlobFileInfo>> ListFilesAsync(int runNumber)
    {
        var prefix = $"runs/{runNumber}/";
        var files = new List<BlobFileInfo>();

        try
        {
            await foreach (var blob in _container.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix, CancellationToken.None))
            {
                var relativePath = blob.Name[prefix.Length..];
                files.Add(new BlobFileInfo
                {
                    BlobName = blob.Name,
                    FileName = relativePath,
                    Size = blob.Properties.ContentLength ?? 0,
                    LastModified = blob.Properties.LastModified
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list blobs for run {RunNumber}", runNumber);
        }

        return files;
    }

    /// <summary>
    /// Blob をバイト配列としてダウンロードする。
    /// </summary>
    public async Task<byte[]?> DownloadBlobAsync(string blobName)
    {
        try
        {
            var blobClient = _container.GetBlobClient(blobName);
            var response = await blobClient.DownloadContentAsync();
            return response.Value.Content.ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download blob {BlobName}", blobName);
            return null;
        }
    }

    /// <summary>
    /// 指定した run_number にファイルが存在するか確認する。
    /// </summary>
    public async Task<bool> HasFilesAsync(int runNumber)
    {
        var prefix = $"runs/{runNumber}/";
        try
        {
            await foreach (var _ in _container.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix, CancellationToken.None))
            {
                return true; // 1つでもあれば true
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check blobs for run {RunNumber}", runNumber);
        }
        return false;
    }
}

/// <summary>
/// Blob ファイルの情報。
/// </summary>
public class BlobFileInfo
{
    public string BlobName { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long Size { get; set; }
    public DateTimeOffset? LastModified { get; set; }
}
