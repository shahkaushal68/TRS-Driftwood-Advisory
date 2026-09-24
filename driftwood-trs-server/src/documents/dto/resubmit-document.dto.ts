import { RegisterDocumentDto } from './register-document.dto';

// Identical payload to a normal upload registration — the client already ran the same
// presign + S3 PUT flow. This DTO only exists so the resubmit endpoint has its own type
// identity in the controller/service signatures.
export class ResubmitDocumentDto extends RegisterDocumentDto {}
