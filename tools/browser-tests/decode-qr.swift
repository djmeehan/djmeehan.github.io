import Foundation
import Vision
import ImageIO
guard CommandLine.arguments.count == 2, let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil), let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("NOIMG"); exit(1) }
let req = VNDetectBarcodesRequest()
req.symbologies = [.qr]
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
let found = (req.results ?? []).compactMap { $0.payloadStringValue }
print(found.isEmpty ? "NONE" : found.joined(separator: "\n"))
