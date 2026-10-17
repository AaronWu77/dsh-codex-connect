import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { imageGenerateTool } from '../src/image-tool.ts'
import { imageSelectionHandleText } from '../src/image-input-contract.ts'
import { promptForImageEdit } from '../src/image-inputs.ts'
import { imageRequestFollowUp } from '../src/client/image-result-presentation.ts'

const attachment = { attachmentId: AttachmentId('sha256:uploaded-image'), mediaType: 'image/png' as const, width: 100, height: 50, bytes: 123, name: 'same.png' }
describe('model-visible image selections', () => {
  it('publishes explicit operations and bounded selector fields without implicit edits', () => {
    const tool = imageGenerateTool(new Context(), {} as never)
    expect({ description: tool.description, parameters: tool.parameters }).toMatchInlineSnapshot(`
      {
        "description": "Generate a new image, or edit an explicitly selected session image. For edits use operation=edit and target; optional ordered references have separate purposes. When image editing is enabled, Codex Connect places a model-visible handle line immediately after each request image, numbered in that message and containing its stable attachmentId. When the user edits an uploaded copy (including first/second attached image), copy the complete attachment reference from the adjacent handle line. An attachmentId shared by an upload and a generated result is ambiguous; ask rather than selecting an older original. For older generated originals use exact assetId handles from the conversation. Never guess or use global recent images; never swap target and reference. Ask when the target is ambiguous. An unavailable edit target must not become text-only generation. Results preserve originals and can be edited again; output size and style are service-controlled.",
        "parameters": {
          "properties": {
            "operation": {
              "description": "Use edit whenever modifying a selected image. Omission is legacy text generation only.",
              "enum": [
                "generate",
                "edit",
              ],
              "type": "string",
            },
            "prompt": {
              "description": "The requested new image or changes to the selected target.",
              "type": "string",
            },
            "references": {
              "description": "Reference images only, kept in the same order the user specified; never place the edit target here.",
              "items": {
                "additionalProperties": false,
                "properties": {
                  "image": {
                    "additionalProperties": false,
                    "description": "Select exactly one: assetId for an original result, attachmentId from this session, or a complete attachment reference. For uploaded copies, including first/second attached image, copy the complete attachment reference from the adjacent handle line. A bare attachmentId shared with a generated result is ambiguous; assetId explicitly selects a stored original. usePreview=true is only for an explicitly chosen lower-resolution preview.",
                    "properties": {
                      "assetId": {
                        "type": "string",
                      },
                      "attachment": {
                        "additionalProperties": false,
                        "properties": {
                          "attachmentId": {
                            "type": "string",
                          },
                          "bytes": {
                            "type": "integer",
                          },
                          "height": {
                            "type": "integer",
                          },
                          "mediaType": {
                            "enum": [
                              "image/png",
                              "image/jpeg",
                              "image/webp",
                            ],
                            "type": "string",
                          },
                          "name": {
                            "type": "string",
                          },
                          "originalDimensions": {
                            "additionalProperties": false,
                            "properties": {
                              "height": {
                                "type": "integer",
                              },
                              "width": {
                                "type": "integer",
                              },
                            },
                            "required": [
                              "width",
                              "height",
                            ],
                            "type": "object",
                          },
                          "width": {
                            "type": "integer",
                          },
                        },
                        "required": [
                          "attachmentId",
                          "mediaType",
                          "width",
                          "height",
                          "bytes",
                        ],
                        "type": "object",
                      },
                      "attachmentId": {
                        "type": "string",
                      },
                      "usePreview": {
                        "type": "boolean",
                      },
                    },
                    "type": "object",
                  },
                  "purpose": {
                    "description": "What to borrow, such as colors or texture, without replacing the target.",
                    "type": "string",
                  },
                },
                "required": [
                  "image",
                  "purpose",
                ],
                "type": "object",
              },
              "type": "array",
            },
            "target": {
              "additionalProperties": false,
              "description": "Select exactly one: assetId for an original result, attachmentId from this session, or a complete attachment reference. For uploaded copies, including first/second attached image, copy the complete attachment reference from the adjacent handle line. A bare attachmentId shared with a generated result is ambiguous; assetId explicitly selects a stored original. usePreview=true is only for an explicitly chosen lower-resolution preview.",
              "properties": {
                "assetId": {
                  "type": "string",
                },
                "attachment": {
                  "additionalProperties": false,
                  "properties": {
                    "attachmentId": {
                      "type": "string",
                    },
                    "bytes": {
                      "type": "integer",
                    },
                    "height": {
                      "type": "integer",
                    },
                    "mediaType": {
                      "enum": [
                        "image/png",
                        "image/jpeg",
                        "image/webp",
                      ],
                      "type": "string",
                    },
                    "name": {
                      "type": "string",
                    },
                    "originalDimensions": {
                      "additionalProperties": false,
                      "properties": {
                        "height": {
                          "type": "integer",
                        },
                        "width": {
                          "type": "integer",
                        },
                      },
                      "required": [
                        "width",
                        "height",
                      ],
                      "type": "object",
                    },
                    "width": {
                      "type": "integer",
                    },
                  },
                  "required": [
                    "attachmentId",
                    "mediaType",
                    "width",
                    "height",
                    "bytes",
                  ],
                  "type": "object",
                },
                "attachmentId": {
                  "type": "string",
                },
                "usePreview": {
                  "type": "boolean",
                },
              },
              "type": "object",
            },
          },
          "required": [
            "prompt",
          ],
          "type": "object",
        },
      }
    `)
  })
  it('projects a complete stable upload handle', () => {
    expect(imageSelectionHandleText(2, attachment)).toMatchInlineSnapshot(`"[Codex Connect image 2 in this message: "same.png" attachmentId=sha256:uploaded-image. For image editing, this ID alone may also identify a historical generated preview. To edit this uploaded copy, use attachment={"attachmentId":"sha256:uploaded-image","mediaType":"image/png","width":100,"height":50,"bytes":123,"name":"same.png"}. For a generated original, use its result assetId instead.]"`)
  })
  it('separates the target from ordered reference purposes in the provider prompt', () => {
    expect(promptForImageEdit('change the sky', { target: { attachment }, references: [{ image: { assetId: 'img_' + 'a'.repeat(32) }, purpose: 'colors only' }] })).toMatchInlineSnapshot(`
      "Image 1 is the target to edit. Preserve aspects not requested to change.
      Image 2 is a reference only. Reference purpose: colors only

      Requested edit:
      change the sky"
    `)
  })
  it('queues an explicit edit request without manufacturing an upload or generation fallback', () => {
    expect(imageRequestFollowUp({ operation: 'edit', prompt: 'change the sky', edit: { target: { attachment }, references: [] } })).toMatchInlineSnapshot(`
      "Edit the explicitly selected image in this conversation using codex_connect_image_generate. Use these exact inputs; if unavailable, report the problem rather than generating a replacement.
      {"operation":"edit","prompt":"change the sky","target":{"attachment":{"attachmentId":"sha256:uploaded-image","mediaType":"image/png","width":100,"height":50,"bytes":123,"name":"same.png"}},"references":[]}"
    `)
  })
})
